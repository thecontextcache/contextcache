from __future__ import annotations

import asyncio
import logging
import os
import socket
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.exceptions import RequestValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from starlette.exceptions import HTTPException as StarletteHTTPException

from .analyzer.cag import evaporation_interval_seconds, evaporate_pheromones, warm_cag_cache
from .auth_utils import SESSION_COOKIE_NAME, hash_token, now_utc
from .db import AsyncSessionLocal, hash_api_key, get_db
from .models import ApiKey, AuthSession, AuthUser, Membership, Organization, User
from .auth_routes import router as auth_router
from .routes import router
from .ingest_routes import ingest_router
from .inbox_routes import inbox_router

logger = logging.getLogger(__name__)

# ── Environment ────────────────────────────────────────────────────────────────
PUBLIC_PATH_PREFIXES = ("/health", "/docs", "/openapi.json", "/waitlist")
PUBLIC_AUTH_PATHS = ("/auth/request-link", "/auth/verify")

APP_ENV = os.getenv("APP_ENV", "").strip().lower()
# Explicit flag required for bootstrap mode — APP_ENV=dev alone is not enough.
# This prevents accidental open access when APP_ENV is misconfigured on staging.
BOOTSTRAP_MODE_ENABLED = os.getenv("BOOTSTRAP_MODE", "").strip().lower() == "true"
BOOTSTRAP_API_KEY = os.getenv("BOOTSTRAP_API_KEY", "").strip()
BOOTSTRAP_KEY_NAME = os.getenv("BOOTSTRAP_KEY_NAME", "dev-key").strip() or "dev-key"
BOOTSTRAP_ORG_NAME = os.getenv("BOOTSTRAP_ORG_NAME", "Demo Org").strip() or "Demo Org"
BOOTSTRAP_OWNER_EMAIL = "demo@local"
BOOTSTRAP_OWNER_NAME = "Demo Owner"

_CAG_EVAPORATION_TASK: asyncio.Task | None = None

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
cors_allow_headers = ["x-api-key", "x-org-id", "content-type"]
if APP_ENV == "dev":
    cors_allow_headers.append("x-user-email")


# ── Bootstrap helper ───────────────────────────────────────────────────────────

async def ensure_dev_bootstrap_api_key() -> tuple[bool, int]:
    """Create a dev bootstrap org/user/key if BOOTSTRAP_MODE=true and no keys exist."""
    if not BOOTSTRAP_MODE_ENABLED:
        return False, 0

    ran_bootstrap = False
    async with AsyncSessionLocal() as session:
        active_key_count = (
            await session.execute(select(func.count(ApiKey.id)).where(ApiKey.revoked_at.is_(None)))
        ).scalar_one()
        if active_key_count > 0 or not BOOTSTRAP_API_KEY:
            return False, int(active_key_count)

        org = (
            await session.execute(
                select(Organization).where(Organization.name == BOOTSTRAP_ORG_NAME).order_by(Organization.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if org is None:
            org = Organization(name=BOOTSTRAP_ORG_NAME)
            session.add(org)
            await session.flush()

        user = (
            await session.execute(
                select(User).where(func.lower(User.email) == BOOTSTRAP_OWNER_EMAIL).limit(1)
            )
        ).scalar_one_or_none()
        if user is None:
            user = User(email=BOOTSTRAP_OWNER_EMAIL, display_name=BOOTSTRAP_OWNER_NAME)
            session.add(user)
            await session.flush()

        membership = (
            await session.execute(
                select(Membership).where(Membership.org_id == org.id, Membership.user_id == user.id).limit(1)
            )
        ).scalar_one_or_none()
        if membership is None:
            session.add(Membership(org_id=org.id, user_id=user.id, role="owner"))

        key_hash = hash_api_key(BOOTSTRAP_API_KEY)
        prefix = BOOTSTRAP_API_KEY[:8]
        existing_key = (
            await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash).limit(1))
        ).scalar_one_or_none()
        if existing_key is None:
            session.add(
                ApiKey(
                    org_id=org.id,
                    name=BOOTSTRAP_KEY_NAME,
                    key_hash=key_hash,
                    prefix=prefix,
                    revoked_at=None,
                )
            )
        else:
            existing_key.org_id = org.id
            existing_key.name = BOOTSTRAP_KEY_NAME
            existing_key.prefix = prefix
            existing_key.revoked_at = None

        await session.commit()
        ran_bootstrap = True
        active_key_count = (
            await session.execute(select(func.count(ApiKey.id)).where(ApiKey.revoked_at.is_(None)))
        ).scalar_one()
        logger.info(
            "[bootstrap] Ensured dev bootstrap API key for org='%s' prefix='%s' name='%s'",
            org.name, prefix, BOOTSTRAP_KEY_NAME,
        )
        return ran_bootstrap, int(active_key_count)


# ── Auth context dataclass ─────────────────────────────────────────────────────

class _AuthContext:
    """Typed result returned by each auth resolver."""
    __slots__ = (
        "api_key_id", "org_id", "role", "actor_user_id", "actor_email",
        "api_key_prefix", "bootstrap_mode", "auth_user_id", "auth_is_admin",
        "auth_session_id",
    )

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)

    @classmethod
    def unauthenticated(cls) -> "_AuthContext":
        return cls(
            api_key_id=None, org_id=None, role=None, actor_user_id=None,
            actor_email=None, api_key_prefix=None, bootstrap_mode=False,
            auth_user_id=None, auth_is_admin=False, auth_session_id=None,
        )


def _apply_auth_context(request: Request, ctx: _AuthContext) -> None:
    request.state.api_key_id = ctx.api_key_id
    request.state.org_id = ctx.org_id
    request.state.role = ctx.role
    request.state.actor_user_id = ctx.actor_user_id
    request.state.actor_email = ctx.actor_email
    request.state.api_key_prefix = ctx.api_key_prefix
    request.state.bootstrap_mode = ctx.bootstrap_mode
    request.state.auth_user_id = ctx.auth_user_id
    request.state.auth_is_admin = ctx.auth_is_admin
    request.state.auth_session_id = ctx.auth_session_id


# ── Auth resolvers ─────────────────────────────────────────────────────────────

async def _resolve_session_auth(
    session_token: str,
    header_org_id: int | None,
    session,
) -> _AuthContext | None:
    """
    Validate a browser session cookie and return an auth context.
    Returns None if the session is invalid/expired.
    """
    session_hash = hash_token(session_token)
    auth_session = (
        await session.execute(
            select(AuthSession).where(
                AuthSession.session_token_hash == session_hash,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now_utc(),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if auth_session is None:
        return None

    auth_user = (
        await session.execute(select(AuthUser).where(AuthUser.id == auth_session.user_id).limit(1))
    ).scalar_one_or_none()
    if auth_user is None or auth_user.is_disabled:
        return None

    auth_session.last_seen_at = now_utc()

    domain_user = (
        await session.execute(
            select(User).where(func.lower(User.email) == auth_user.email.lower()).limit(1)
        )
    ).scalar_one_or_none()

    resolved_org_id = None
    resolved_role = None
    resolved_user_id = None

    if domain_user is not None:
        memberships = (
            await session.execute(
                select(Membership.org_id, Membership.role, Membership.user_id)
                .where(Membership.user_id == domain_user.id)
                .order_by(Membership.id.asc())
            )
        ).all()
        if memberships:
            resolved_org_id = memberships[0][0]
            resolved_role = memberships[0][1]
            resolved_user_id = memberships[0][2]
            if header_org_id is not None:
                for org_id, role, user_id in memberships:
                    if org_id == header_org_id:
                        resolved_org_id = org_id
                        resolved_role = role
                        resolved_user_id = user_id
                        break
                else:
                    return None  # org mismatch → caller returns 403

    await session.commit()
    return _AuthContext(
        api_key_id=None,
        org_id=resolved_org_id,
        role=resolved_role,
        actor_user_id=resolved_user_id,
        actor_email=auth_user.email,
        api_key_prefix=None,
        bootstrap_mode=False,
        auth_user_id=auth_user.id,
        auth_is_admin=bool(auth_user.is_admin),
        auth_session_id=auth_session.id,
    )


async def _resolve_api_key_auth(
    provided_key: str,
    header_org_id: int | None,
    session,
) -> _AuthContext | JSONResponse:
    """
    Validate an API key and return an auth context.
    Returns a JSONResponse (401/403) if the key is invalid.
    """
    hashed = hash_api_key(provided_key)
    api_key_row = (
        await session.execute(
            select(ApiKey).where(ApiKey.key_hash == hashed, ApiKey.revoked_at.is_(None)).limit(1)
        )
    ).scalar_one_or_none()
    if api_key_row is None:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    if header_org_id is not None and header_org_id != api_key_row.org_id:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    # Track last_used_at and use_count — never block the request over a stats write
    try:
        from sqlalchemy import update as sa_update
        await session.execute(
            sa_update(ApiKey)
            .where(ApiKey.id == api_key_row.id)
            .values(
                last_used_at=datetime.now(timezone.utc),
                use_count=ApiKey.use_count + 1,
            )
        )
        await session.commit()
    except Exception:
        logger.warning(
            "[auth] Failed to update API key usage stats for key_id=%s",
            api_key_row.id, exc_info=True,
        )

    # Resolve org membership for role/user context
    membership_row = (
        await session.execute(
            select(Membership.role, Membership.user_id)
            .where(Membership.org_id == api_key_row.org_id)
            .order_by(Membership.id.asc())
            .limit(1)
        )
    ).first()

    return _AuthContext(
        api_key_id=api_key_row.id,
        org_id=api_key_row.org_id,
        role=membership_row[0] if membership_row else None,
        actor_user_id=membership_row[1] if membership_row else None,
        actor_email=None,
        api_key_prefix=api_key_row.prefix,
        bootstrap_mode=False,
        auth_user_id=None,
        auth_is_admin=False,
        auth_session_id=None,
    )


async def _resolve_bootstrap_auth(
    header_org_id: int | None,
    default_org_id: int | None,
    session,
) -> _AuthContext:
    """
    Bootstrap mode: no keys exist and BOOTSTRAP_MODE=true (dev only).
    Grants owner role so the first API key can be created.
    """
    resolved_org_id = header_org_id if header_org_id is not None else default_org_id
    resolved_role = None
    resolved_user_id = None

    if resolved_org_id is not None:
        membership_row = (
            await session.execute(
                select(Membership.role, Membership.user_id)
                .where(Membership.org_id == resolved_org_id)
                .order_by(Membership.id.asc())
                .limit(1)
            )
        ).first()
        if membership_row:
            resolved_role = membership_row[0]
            resolved_user_id = membership_row[1]
        else:
            resolved_role = "owner"

    return _AuthContext(
        api_key_id=None,
        org_id=resolved_org_id,
        role=resolved_role,
        actor_user_id=resolved_user_id,
        actor_email=None,
        api_key_prefix=None,
        bootstrap_mode=True,
        auth_user_id=None,
        auth_is_admin=False,
        auth_session_id=None,
    )


# ── Lifespan ───────────────────────────────────────────────────────────────────

def _check_env_var_names() -> None:
    wrong_to_correct: dict[str, str] = {
        "DAILY_MEMORIES_LIMIT": "DAILY_MEMORY_LIMIT  (or DAILY_MAX_MEMORIES)",
        "DAILY_PROJECTS_LIMIT": "DAILY_PROJECT_LIMIT (or DAILY_MAX_PROJECTS)",
        "DAILY_RECALLS_LIMIT":  "DAILY_RECALL_LIMIT  (or DAILY_MAX_RECALLS)",
    }
    for wrong, correct in wrong_to_correct.items():
        if os.getenv(wrong):
            logger.warning(
                "[env-warn] %s is SET but NOT read by the backend. Rename it to %s. "
                "Daily limits are currently using default values.",
                wrong, correct,
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _CAG_EVAPORATION_TASK

    # ── Startup ────────────────────────────────────────────────────────────────
    _check_env_var_names()

    if BOOTSTRAP_MODE_ENABLED and APP_ENV != "dev":
        logger.warning(
            "[security] BOOTSTRAP_MODE=true but APP_ENV=%s. "
            "Bootstrap mode should only be used in development environments.",
            APP_ENV,
        )

    cached_chunks = warm_cag_cache()
    interval = evaporation_interval_seconds()
    if interval > 0 and cached_chunks:
        async def _evaporation_loop() -> None:
            while True:
                try:
                    await asyncio.sleep(interval)
                    result = await asyncio.to_thread(evaporate_pheromones)
                    logger.info(
                        "[cag] evaporated items=%s factor=%s",
                        result.get("items", 0), result.get("evaporation_factor", "n/a"),
                    )
                except asyncio.CancelledError:
                    break
                except Exception:
                    logger.warning("[cag] evaporation loop error", exc_info=True)

        _CAG_EVAPORATION_TASK = asyncio.create_task(_evaporation_loop())

    if BOOTSTRAP_MODE_ENABLED:
        logger.info(
            "[bootstrap] BOOTSTRAP_MODE=true BOOTSTRAP_API_KEY_present=%s",
            "yes" if bool(BOOTSTRAP_API_KEY) else "no",
        )
    ran_bootstrap, active_key_count = await ensure_dev_bootstrap_api_key()
    if BOOTSTRAP_MODE_ENABLED:
        logger.info(
            "[bootstrap] startup_bootstrap_ran=%s active_api_keys=%d",
            "yes" if ran_bootstrap else "no", active_key_count,
        )

    yield

    # ── Shutdown ───────────────────────────────────────────────────────────────
    if _CAG_EVAPORATION_TASK is not None:
        _CAG_EVAPORATION_TASK.cancel()
        try:
            await _CAG_EVAPORATION_TASK
        except asyncio.CancelledError:
            pass
        _CAG_EVAPORATION_TASK = None


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="ContextCache API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=cors_allow_headers,
    expose_headers=["content-type"],
)


# ── Auth middleware ────────────────────────────────────────────────────────────

@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    path = request.url.path

    if request.method == "OPTIONS":
        return await call_next(request)

    if path.startswith(PUBLIC_PATH_PREFIXES) or path in PUBLIC_AUTH_PATHS:
        return await call_next(request)

    provided_key = request.headers.get("x-api-key", "").strip()
    provided_org_id = request.headers.get("x-org-id", "").strip()
    # X-User-Email impersonation is only valid in dev AND requires the explicit
    # ALLOW_EMAIL_IMPERSONATION=true flag to reduce accidental staging exposure.
    allow_impersonation = (
        APP_ENV == "dev"
        and os.getenv("ALLOW_EMAIL_IMPERSONATION", "").strip().lower() == "true"
    )
    provided_user_email = (
        request.headers.get("x-user-email", "").strip().lower()
        if allow_impersonation
        else ""
    )

    try:
        header_org_id = int(provided_org_id) if provided_org_id else None
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid X-Org-Id header"})

    async with AsyncSessionLocal() as session:
        # ── 1. Session cookie auth ──────────────────────────────────────────
        session_token = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
        if session_token:
            ctx = await _resolve_session_auth(session_token, header_org_id, session)
            if ctx is not None:
                _apply_auth_context(request, ctx)
                return await call_next(request)
            elif header_org_id is not None:
                # Session was valid but org header didn't match any membership
                return JSONResponse(status_code=403, content={"detail": "Forbidden"})

        # ── 2. Count active keys (needed for bootstrap gate) ────────────────
        active_key_count = (
            await session.execute(select(func.count(ApiKey.id)).where(ApiKey.revoked_at.is_(None)))
        ).scalar_one()
        org_count = (await session.execute(select(func.count(Organization.id)))).scalar_one()
        default_org_id = None
        if org_count == 1:
            default_org_id = (
                await session.execute(select(Organization.id).order_by(Organization.id.asc()).limit(1))
            ).scalar_one_or_none()

        if active_key_count == 0 and not BOOTSTRAP_MODE_ENABLED:
            # Only return 503 if the system has never been set up (no users exist).
            # If users exist but all keys were revoked, return 401 — the system IS
            # configured, the caller just isn't authenticated.  Returning 503 here
            # when the frontend calls /auth/me causes a hydration crash: the server
            # renders the landing page but the client renders ServiceUnavailable.
            user_count = (
                await session.execute(select(func.count(AuthUser.id)))
            ).scalar_one()
            if user_count == 0:
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Service unavailable: system not configured"},
                )
            # System has users → normal 401 for unauthenticated requests
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized"},
            )

        # ── 3. Bootstrap mode (BOOTSTRAP_MODE=true + no keys) ───────────────
        if active_key_count == 0 and BOOTSTRAP_MODE_ENABLED:
            if not provided_key:
                logger.warning(
                    "[auth] No api_keys exist; granting bootstrap access. "
                    "Create an API key to disable bootstrap mode."
                )
            ctx = await _resolve_bootstrap_auth(header_org_id, default_org_id, session)
            _apply_auth_context(request, ctx)
            return await call_next(request)

        # ── 4. API key auth ─────────────────────────────────────────────────
        if not provided_key:
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

        result = await _resolve_api_key_auth(provided_key, header_org_id, session)
        if isinstance(result, JSONResponse):
            return result

        # Apply X-User-Email override (dev + explicit flag only)
        if provided_user_email and result.org_id is not None:
            membership_row = (
                await session.execute(
                    select(Membership.role, Membership.user_id)
                    .join(User, User.id == Membership.user_id)
                    .where(
                        Membership.org_id == result.org_id,
                        func.lower(User.email) == provided_user_email,
                    )
                    .limit(1)
                )
            ).first()
            if membership_row:
                result.role = membership_row[0]
                result.actor_user_id = membership_row[1]
                result.actor_email = provided_user_email

        _apply_auth_context(request, result)

    return await call_next(request)


# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(router)
app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(inbox_router)


# ── Exception handlers ─────────────────────────────────────────────────────────

@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(HTTPException)
async def fastapi_http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation error", "errors": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    import traceback
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Health endpoints ───────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/perf")
async def health_perf(db: AsyncSession = Depends(get_db)):
    start = asyncio.get_running_loop().time()
    await db.execute(select(func.now()))
    elapsed_ms = int((asyncio.get_running_loop().time() - start) * 1000)

    from .analyzer.cag import get_cag_cache_stats
    cag_stats = get_cag_cache_stats()

    return {"status": "ok", "db_ping_ms": elapsed_ms, "cag_perf": cag_stats}


@app.get("/health/worker")
def health_worker():
    worker_enabled = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"
    broker = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
    return {
        "status": "ok" if worker_enabled else "disabled",
        "worker_enabled": worker_enabled,
        "broker": broker,
    }


@app.get("/health/redis")
def health_redis():
    broker = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
    parsed = urlparse(broker)
    host = parsed.hostname or "redis"
    port = parsed.port or 6379
    try:
        with socket.create_connection((host, port), timeout=1.5):
            return {"status": "ok", "host": host, "port": port}
    except OSError as exc:
        return {"status": "unreachable", "host": host, "port": port, "detail": str(exc)}
