from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from starlette.exceptions import HTTPException as StarletteHTTPException

from .db import AsyncSessionLocal, hash_api_key
from .models import ApiKey, Membership, Organization, User
from .routes import router

app = FastAPI(title="ContextCache API", version="0.1.0")
PUBLIC_PATH_PREFIXES = ("/health", "/docs", "/openapi.json")
WARNED_NO_KEYS = False
APP_ENV = os.getenv("APP_ENV", "").strip().lower()
BOOTSTRAP_API_KEY = os.getenv("BOOTSTRAP_API_KEY", "").strip()
BOOTSTRAP_KEY_NAME = os.getenv("BOOTSTRAP_KEY_NAME", "dev-key").strip() or "dev-key"
BOOTSTRAP_ORG_NAME = os.getenv("BOOTSTRAP_ORG_NAME", "Demo Org").strip() or "Demo Org"
BOOTSTRAP_OWNER_EMAIL = "demo@local"
BOOTSTRAP_OWNER_NAME = "Demo Owner"

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
cors_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def ensure_dev_bootstrap_api_key() -> None:
    if APP_ENV != "dev":
        return
    if not BOOTSTRAP_API_KEY:
        return

    async with AsyncSessionLocal() as session:
        active_key_count = (
            await session.execute(select(func.count(ApiKey.id)).where(ApiKey.revoked_at.is_(None)))
        ).scalar_one()
        if active_key_count > 0:
            return

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
        print(
            f"[bootstrap] Ensured dev bootstrap API key for org='{org.name}' "
            f"prefix='{prefix}' name='{BOOTSTRAP_KEY_NAME}'"
        )


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    global WARNED_NO_KEYS
    path = request.url.path

    # Always allow CORS preflight requests.
    if request.method == "OPTIONS":
        return await call_next(request)

    if path.startswith(PUBLIC_PATH_PREFIXES):
        return await call_next(request)

    provided_key = request.headers.get("x-api-key", "").strip()
    provided_org_id = request.headers.get("x-org-id", "").strip()
    provided_user_email = request.headers.get("x-user-email", "").strip().lower()

    try:
        header_org_id = int(provided_org_id) if provided_org_id else None
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid X-Org-Id header"})

    async with AsyncSessionLocal() as session:
        active_key_count = (
            await session.execute(select(func.count(ApiKey.id)).where(ApiKey.revoked_at.is_(None)))
        ).scalar_one()
        org_count = (await session.execute(select(func.count(Organization.id)))).scalar_one()
        default_org_id = None
        if org_count == 1:
            default_org_id = (
                await session.execute(select(Organization.id).order_by(Organization.id.asc()).limit(1))
            ).scalar_one_or_none()

        bootstrap_mode = active_key_count == 0
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

    return await call_next(request)


@app.on_event("startup")
async def startup() -> None:
    await ensure_dev_bootstrap_api_key()


app.include_router(router)


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
async def unhandled_exception_handler(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"status": "ok"}
