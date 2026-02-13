from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import hash_api_key
from app.models import ApiKey, Organization
from app.seed import seed
from .conftest import Ctx, auth_headers

pytestmark = pytest.mark.asyncio


async def test_health_public(client) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_me_requires_key_and_returns_context(client, app_ctx: Ctx) -> None:
    unauthorized = await client.get("/me")
    assert unauthorized.status_code == 401

    authorized = await client.get("/me", headers=auth_headers(app_ctx, role="owner", include_org=False))
    assert authorized.status_code == 200
    body = authorized.json()
    assert body["org_id"] == app_ctx.org_id
    assert body["role"] == "owner"
    assert body["api_key_prefix"].startswith("cck_")
    assert body["actor_user_id"] is not None


async def test_seed_smoke_and_list_projects(client, db_session: AsyncSession) -> None:
    await seed()

    demo_org = (
        await db_session.execute(
            select(Organization).where(Organization.name == "Demo Org").order_by(Organization.id.asc()).limit(1)
        )
    ).scalar_one()

    raw_key = f"cck_demo_smoke_{uuid.uuid4().hex[:8]}"
    db_session.add(
        ApiKey(
            org_id=demo_org.id,
            name="pytest-demo-key",
            key_hash=hash_api_key(raw_key),
            prefix=raw_key[:8],
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/orgs/{demo_org.id}/projects",
        headers={
            "X-API-Key": raw_key,
            "X-Org-Id": str(demo_org.id),
            "X-User-Email": "demo@local",
        },
    )
    assert response.status_code == 200
    projects = response.json()
    assert any(item["name"] == "Demo Project" for item in projects)


@pytest.mark.parametrize("role", ["owner", "admin"])
async def test_create_org_project_allowed_for_owner_admin(client, app_ctx: Ctx, role: str) -> None:
    response = await client.post(
        f"/orgs/{app_ctx.org_id}/projects",
        headers=auth_headers(app_ctx, role=role),
        json={"name": f"Project by {role}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["org_id"] == app_ctx.org_id
    assert body["name"] == f"Project by {role}"


@pytest.mark.parametrize("role", ["member", "owner"])
async def test_create_memory_allowed_for_member_owner(client, app_ctx: Ctx, role: str) -> None:
    response = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role=role),
        json={"type": "finding", "content": f"Memory added by {role}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == app_ctx.project_id
    assert body["type"] == "finding"


async def test_recall_returns_rank_score_for_fts_matches(client, app_ctx: Ctx) -> None:
    first = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "finding", "content": "Database migrations with alembic improve reliability."},
    )
    assert first.status_code == 201

    second = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "note", "content": "General note unrelated to migration ranking."},
    )
    assert second.status_code == 201

    recall = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=auth_headers(app_ctx, role="viewer"),
        params={"query": "alembic migrations reliability", "limit": 5},
    )
    assert recall.status_code == 200
    items = recall.json()["items"]
    assert len(items) >= 1
    assert items[0]["rank_score"] is not None
