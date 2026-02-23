from __future__ import annotations

import asyncio
import os
import socket
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

app = FastAPI(title="ContextCache API", version="0.1.0")
PUBLIC_PATH_PREFIXES = ("/health", "/docs", "/openapi.json", "/waitlist")
PUBLIC_AUTH_PATHS = ("/auth/request-link", "/auth/verify")
WARNED_NO_KEYS = False
APP_ENV = os.getenv("APP_ENV", "").strip().lower()
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=cors_allow_headers,
    expose_headers=["content-type"],
)


async def ensure_dev_bootstrap_api_key() -> tuple[bool, int]:
    if APP_ENV != "dev":
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
        print(
            f"[bootstrap] Ensured dev bootstrap API key for org='{org.name}' "
            f"prefix='{prefix}' name='{BOOTSTRAP_KEY_NAME}'"
        )
        return ran_bootstrap, int(active_key_count)


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    global WARNED_NO_KEYS
    path = request.url.path

    # Always allow CORS preflight requests.
    if request.method == "OPTIONS":
        return await call_next(request)

    if path.startswith(PUBLIC_PATH_PREFIXES) or path in PUBLIC_AUTH_PATHS:
        return await call_next(request)

    provided_key = request.headers.get("x-api-key", "").strip()
    provided_org_id = request.headers.get("x-org-id", "").strip()
    provided_user_email = (
        request.headers.get("x-user-email", "").strip().lower() if APP_ENV == "dev" else ""
    )

    try:
        header_org_id = int(provided_org_id) if provided_org_id else None
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid X-Org-Id header"})

    async with AsyncSessionLocal() as session:
        session_token = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
        if session_token:
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
            if auth_session is not None:
                auth_user = (
                    await session.execute(select(AuthUser).where(AuthUser.id == auth_session.user_id).limit(1))
                ).scalar_one_or_none()
                if auth_user is not None and not auth_user.is_disabled:
                    auth_session.last_seen_at = now_utc()
                    domain_user = (
                        await session.execute(
                            select(User).where(func.lower(User.email) == auth_user.email.lower()).limit(1)
                        )
                    ).scalar_one_or_none()
                    provided_user_email = ""
                    resolved_org_id = None
                    resolved_role = None
                    resolved_user_id = None
                    if domain_user is not None:
                        membership_query = (
                            select(Membership.org_id, Membership.role, Membership.user_id)
                            .where(Membership.user_id == domain_user.id)
                            .order_by(Membership.id.asc())
                        )
                        memberships = (await session.execute(membership_query)).all()
                        if memberships:
                            resolved_org_id = memberships[0][0]
                            resolved_role = memberships[0][1]
                            resolved_user_id = memberships[0][2]
                            if provided_org_id:
                                try:
                                    header_org_id = int(provided_org_id)
                                except ValueError:
                                    return JSONResponse(status_code=400, content={"detail": "Invalid X-Org-Id header"})
                                for org_id, role, user_id in memberships:
                                    if org_id == header_org_id:
                                        resolved_org_id = org_id
                                        resolved_role = role
                                        resolved_user_id = user_id
                                        break
                                else:
                                    return JSONResponse(status_code=403, content={"detail": "Forbidden"})

                    request.state.api_key_id = None
                    request.state.org_id = resolved_org_id
                    request.state.role = resolved_role
                    request.state.actor_user_id = resolved_user_id
                    request.state.actor_email = auth_user.email
                    request.state.api_key_prefix = None
                    request.state.bootstrap_mode = False
                    request.state.auth_user_id = auth_user.id
                    request.state.auth_is_admin = bool(auth_user.is_admin)
                    request.state.auth_session_id = auth_session.id
                    await session.commit()
                    return await call_next(request)

        active_key_count = (
            await session.execute(select(func.count(ApiKey.id)).where(ApiKey.revoked_at.is_(None)))
        ).scalar_one()
        org_count = (await session.execute(select(func.count(Organization.id)))).scalar_one()
        default_org_id = None
        if org_count == 1:
            default_org_id = (
                await session.execute(select(Organization.id).order_by(Organization.id.asc()).limit(1))
            ).scalar_one_or_none()

        if active_key_count == 0 and APP_ENV != "dev":
            return JSONResponse(
                status_code=503,
                content={"detail": "Service unavailable: no active API keys configured"},
            )

        bootstrap_mode = active_key_count == 0 and APP_ENV == "dev"
        resolved_org_id = None
        resolved_role = None
        resolved_user_id = None
        resolved_api_key_id = None
        resolved_key_prefix = None

        if bootstrap_mode:
            if not provided_key:
                if not WARNED_NO_KEYS:
                    print("[WARN] No api_keys exist; allowing requests in bootstrap mode.")
                    WARNED_NO_KEYS = True
            resolved_org_id = header_org_id if header_org_id is not None else default_org_id
        else:
            if not provided_key:
                return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
            hashed = hash_api_key(provided_key)
            api_key_row = (
                await session.execute(
                    select(ApiKey).where(ApiKey.key_hash == hashed, ApiKey.revoked_at.is_(None)).limit(1)
                )
            ).scalar_one_or_none()
            if api_key_row is None:
                return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
            resolved_api_key_id = api_key_row.id
            resolved_org_id = api_key_row.org_id
            resolved_key_prefix = api_key_row.prefix
            if header_org_id is not None and header_org_id != resolved_org_id:
                return JSONResponse(status_code=403, content={"detail": "Forbidden"})

        if resolved_org_id is not None:
            if provided_user_email:
                membership_row = (
                    await session.execute(
                        select(Membership.role, Membership.user_id)
                        .join(User, User.id == Membership.user_id)
                        .where(
                            Membership.org_id == resolved_org_id,
                            func.lower(User.email) == provided_user_email,
                        )
                        .limit(1)
                    )
                ).first()
            else:
                membership_row = (
                    await session.execute(
                        select(Membership.role, Membership.user_id)
                        .where(Membership.org_id == resolved_org_id)
                        .order_by(Membership.id.asc())
                        .limit(1)
                    )
                ).first()
            if membership_row is not None:
                resolved_role = membership_row[0]
                resolved_user_id = membership_row[1]
            elif bootstrap_mode:
                resolved_role = "owner"

        request.state.api_key_id = resolved_api_key_id
        request.state.org_id = resolved_org_id
        request.state.role = resolved_role
        request.state.actor_user_id = resolved_user_id
        request.state.actor_email = provided_user_email or None
        request.state.api_key_prefix = resolved_key_prefix
        request.state.bootstrap_mode = bootstrap_mode
        request.state.auth_user_id = None
        request.state.auth_is_admin = False
        request.state.auth_session_id = None

    return await call_next(request)


def _check_env_var_names() -> None:
    """Warn if deprecated or misspelled env var names are present in the environment.

    Common mistakes (found in prod .env files):
      DAILY_MEMORIES_LIMIT  → should be DAILY_MEMORY_LIMIT  (or DAILY_MAX_MEMORIES)
      DAILY_PROJECTS_LIMIT  → should be DAILY_PROJECT_LIMIT (or DAILY_MAX_PROJECTS)
      DAILY_RECALLS_LIMIT   → should be DAILY_RECALL_LIMIT  (or DAILY_MAX_RECALLS)
    These misspelled names are silently ignored by the backend and default values are used.
    """
    wrong_to_correct: dict[str, str] = {
        "DAILY_MEMORIES_LIMIT": "DAILY_MEMORY_LIMIT  (or DAILY_MAX_MEMORIES)",
        "DAILY_PROJECTS_LIMIT": "DAILY_PROJECT_LIMIT (or DAILY_MAX_PROJECTS)",
        "DAILY_RECALLS_LIMIT":  "DAILY_RECALL_LIMIT  (or DAILY_MAX_RECALLS)",
    }
    for wrong, correct in wrong_to_correct.items():
        if os.getenv(wrong):
            print(
                f"[env-warn] {wrong} is SET but NOT read by the backend. "
                f"Rename it to {correct}. "
                f"Daily limits are currently using default values."
            )


@app.on_event("startup")
async def startup() -> None:
    global _CAG_EVAPORATION_TASK
    _check_env_var_names()
    cached_chunks = warm_cag_cache()
    interval = evaporation_interval_seconds()
    if interval > 0 and cached_chunks:
        async def _evaporation_loop() -> None:
            while True:
                try:
                    await asyncio.sleep(interval)
                    result = await asyncio.to_thread(evaporate_pheromones)
                    print(
                        f"[cag] evaporated items={result.get('items', 0)} "
                        f"factor={result.get('evaporation_factor', 'n/a')}"
                    )
                except asyncio.CancelledError:
                    break
                except Exception as exc:
                    print(f"[cag] evaporation loop warning: {exc}")

        _CAG_EVAPORATION_TASK = asyncio.create_task(_evaporation_loop())
    if APP_ENV == "dev":
        print(
            f"[bootstrap] APP_ENV=dev BOOTSTRAP_API_KEY_present="
            f"{'yes' if bool(BOOTSTRAP_API_KEY) else 'no'}"
        )
    ran_bootstrap, active_key_count = await ensure_dev_bootstrap_api_key()
    if APP_ENV == "dev":
        print(
            f"[bootstrap] startup_bootstrap_ran={'yes' if ran_bootstrap else 'no'} "
            f"active_api_keys={active_key_count}"
        )


@app.on_event("shutdown")
async def shutdown() -> None:
    global _CAG_EVAPORATION_TASK
    if _CAG_EVAPORATION_TASK is not None:
        _CAG_EVAPORATION_TASK.cancel()
        try:
            await _CAG_EVAPORATION_TASK
        except asyncio.CancelledError:
            pass
        _CAG_EVAPORATION_TASK = None


app.include_router(router)
app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(inbox_router)


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
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    import traceback
    traceback.print_exc()  # prints full traceback to docker logs
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


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

    return {
        "status": "ok",
        "db_ping_ms": elapsed_ms,
        "cag_perf": cag_stats,
    }


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
