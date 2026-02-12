from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db import AsyncSessionLocal, hash_api_key
from app.main import app
from app.migrate import run_migrations
from app.models import ApiKey, Membership, Organization, Project, User


@dataclass
class TestContext:
    org_id: int
    project_id: int
    api_key: str
    users: dict[str, str]
    user_ids: list[int]


def _create_context() -> TestContext:
    suffix = uuid.uuid4().hex[:8]
    org_name = f"Pytest Org {suffix}"
    raw_key = f"cck_test_{suffix}"

    async def _inner() -> TestContext:
        async with AsyncSessionLocal() as session:
            org = Organization(name=org_name)
            session.add(org)
            await session.flush()

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
                session.add(user)
                await session.flush()
                role_to_user_id[role] = user.id
                created_user_ids.append(user.id)
                session.add(Membership(org_id=org.id, user_id=user.id, role=role))

            key = ApiKey(
                org_id=org.id,
                name="pytest-key",
                key_hash=hash_api_key(raw_key),
                prefix=raw_key[:8],
            )
            session.add(key)

            project = Project(name=f"Pytest Project {suffix}", org_id=org.id, created_by_user_id=role_to_user_id["owner"])
            session.add(project)

            await session.commit()
            await session.refresh(project)

            return TestContext(
                org_id=org.id,
                project_id=project.id,
                api_key=raw_key,
                users=users,
                user_ids=created_user_ids,
            )

    return asyncio.run(_inner())


def _cleanup_context(ctx: TestContext) -> None:
    async def _inner() -> None:
        async with AsyncSessionLocal() as session:
            await session.execute(delete(Organization).where(Organization.id == ctx.org_id))
            await session.execute(delete(User).where(User.id.in_(ctx.user_ids)))
            await session.commit()

    asyncio.run(_inner())


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session", autouse=True)
def ensure_test_schema() -> None:
    asyncio.run(run_migrations())


@pytest.fixture()
def test_ctx() -> TestContext:
    ctx = _create_context()
    try:
        yield ctx
    finally:
        _cleanup_context(ctx)


def auth_headers(ctx: TestContext, *, role: str | None = None, include_org: bool = True) -> dict[str, str]:
    headers: dict[str, str] = {"X-API-Key": ctx.api_key}
    if include_org:
        headers["X-Org-Id"] = str(ctx.org_id)
    if role:
        headers["X-User-Email"] = ctx.users[role]
    return headers
