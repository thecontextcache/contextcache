from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import dataclass
from typing import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.db as db_module
import app.main as main_module
import app.migrate as migrate_module
import app.rotate_key as rotate_key_module
import app.seed as seed_module
from app.db import get_db, hash_api_key
from app.main import app
from app.models import ApiKey, Membership, Organization, Project, User

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://contextcache:change-me@db:5432/contextcache",
)
DB_WAIT_MAX_ATTEMPTS = int(os.getenv("DB_WAIT_MAX_ATTEMPTS", "60"))
DB_WAIT_SECONDS = float(os.getenv("DB_WAIT_SECONDS", "1"))


@dataclass
class Ctx:
    org_id: int
    project_id: int
    api_key: str
    users: dict[str, str]


async def wait_for_db(engine: AsyncEngine) -> None:
    last_error: Exception | None = None
    for attempt in range(1, DB_WAIT_MAX_ATTEMPTS + 1):
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return
        except Exception as exc:  # pragma: no cover
            last_error = exc
            if attempt >= DB_WAIT_MAX_ATTEMPTS:
                break
            await asyncio.sleep(DB_WAIT_SECONDS)

    assert last_error is not None
    raise last_error


@pytest_asyncio.fixture(scope="session")
async def test_engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DATABASE_URL, future=True, poolclass=NullPool)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

    original_db_engine = db_module.engine
    original_db_session_local = db_module.AsyncSessionLocal
    original_main_session_local = main_module.AsyncSessionLocal
    original_migrate_engine = migrate_module.engine
    original_seed_session_local = seed_module.AsyncSessionLocal
    original_rotate_session_local = rotate_key_module.AsyncSessionLocal

    db_module.engine = engine
    db_module.AsyncSessionLocal = session_factory
    main_module.AsyncSessionLocal = session_factory
    migrate_module.engine = engine
    seed_module.AsyncSessionLocal = session_factory
    rotate_key_module.AsyncSessionLocal = session_factory

    await wait_for_db(engine)
    await migrate_module.run_migrations()

    try:
        yield engine
    finally:
        db_module.engine = original_db_engine
        db_module.AsyncSessionLocal = original_db_session_local
        main_module.AsyncSessionLocal = original_main_session_local
        migrate_module.engine = original_migrate_engine
        seed_module.AsyncSessionLocal = original_seed_session_local
        rotate_key_module.AsyncSessionLocal = original_rotate_session_local
        await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def session_factory(test_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=test_engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture(autouse=True)
async def clean_db(test_engine: AsyncEngine) -> AsyncIterator[None]:
    async with test_engine.begin() as conn:
        await conn.execute(
            text(
                """
                TRUNCATE TABLE
                    usage_counters,
                    usage_periods,
                    usage_events,
                    auth_login_events,
                    auth_sessions,
                    auth_magic_links,
                    auth_invites,
                    waitlist,
                    auth_users,
                    audit_logs,
                    memory_embeddings,
                    memory_tags,
                    tags,
                    memories,
                    projects,
                    memberships,
                    api_keys,
                    users,
                    organizations
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


@pytest_asyncio.fixture(autouse=True)
async def override_get_db(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[None]:
    async def _override() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture()
async def client(test_engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
    async with LifespanManager(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
            timeout=5.0,
        ) as async_client:
            yield async_client


@pytest_asyncio.fixture()
async def db_session(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture()
async def app_ctx(db_session: AsyncSession) -> AsyncIterator[Ctx]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"Pytest Org {suffix}")
    db_session.add(org)
    await db_session.flush()

    users = {
        "owner": f"owner-{suffix}@local",
        "admin": f"admin-{suffix}@local",
        "member": f"member-{suffix}@local",
        "viewer": f"viewer-{suffix}@local",
    }

    role_to_user_id: dict[str, int] = {}
    for role, email in users.items():
        user = User(email=email, display_name=role.title())
        db_session.add(user)
        await db_session.flush()
        role_to_user_id[role] = user.id
        db_session.add(Membership(org_id=org.id, user_id=user.id, role=role))

    raw_key = f"cck_test_{suffix}"
    db_session.add(
        ApiKey(
            org_id=org.id,
            name="pytest-key",
            key_hash=hash_api_key(raw_key),
            prefix=raw_key[:8],
        )
    )

    project = Project(
        name=f"Pytest Project {suffix}",
        org_id=org.id,
        created_by_user_id=role_to_user_id["owner"],
    )
    db_session.add(project)

    await db_session.commit()
    await db_session.refresh(project)

    yield Ctx(
        org_id=org.id,
        project_id=project.id,
        api_key=raw_key,
        users=users,
    )


def auth_headers(ctx: Ctx, *, role: str | None = None, include_org: bool = True) -> dict[str, str]:
    headers: dict[str, str] = {"X-API-Key": ctx.api_key}
    if include_org:
        headers["X-Org-Id"] = str(ctx.org_id)
    if role:
        headers["X-User-Email"] = ctx.users[role]
    return headers
