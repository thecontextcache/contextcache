from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import dataclass
from typing import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.db import hash_api_key
from app.main import app
from app.migrate import run_migrations
from app.models import ApiKey, Membership, Organization, Project, User

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://contextcache:change-me@db:5432/contextcache",
)
DB_WAIT_MAX_ATTEMPTS = int(os.getenv("DB_WAIT_MAX_ATTEMPTS", "60"))
DB_WAIT_SECONDS = float(os.getenv("DB_WAIT_SECONDS", "1"))


@dataclass
class AppContext:
    org_id: int
    project_id: int
    api_key: str
    users: dict[str, str]
    user_ids: list[int]


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
    engine = create_async_engine(
        DATABASE_URL,
        future=True,
        poolclass=NullPool,
    )
    await wait_for_db(engine)
    await run_migrations()
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def session_factory(test_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=test_engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture()
async def db_session(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


@pytest_asyncio.fixture()
async def client(test_engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, lifespan="on")
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


@pytest_asyncio.fixture()
async def app_ctx(db_session: AsyncSession) -> AsyncIterator[AppContext]:
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
    created_user_ids: list[int] = []
    for role, email in users.items():
        user = User(email=email, display_name=role.title())
        db_session.add(user)
        await db_session.flush()
        created_user_ids.append(user.id)
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

    ctx = AppContext(
        org_id=org.id,
        project_id=project.id,
        api_key=raw_key,
        users=users,
        user_ids=created_user_ids,
    )

    try:
        yield ctx
    finally:
        await db_session.execute(delete(Organization).where(Organization.id == ctx.org_id))
        await db_session.execute(delete(User).where(User.id.in_(ctx.user_ids)))
        await db_session.commit()


def auth_headers(ctx: AppContext, *, role: str | None = None, include_org: bool = True) -> dict[str, str]:
    headers: dict[str, str] = {"X-API-Key": ctx.api_key}
    if include_org:
        headers["X-Org-Id"] = str(ctx.org_id)
    if role:
        headers["X-User-Email"] = ctx.users[role]
    return headers
