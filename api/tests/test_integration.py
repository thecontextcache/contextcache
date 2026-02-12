from __future__ import annotations

import pytest

from .conftest import TestContext, auth_headers


def test_health_public(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_me_requires_key_and_returns_context(client, test_ctx: TestContext) -> None:
    unauthorized = client.get("/me")
    assert unauthorized.status_code == 401

    authorized = client.get("/me", headers=auth_headers(test_ctx, role="owner", include_org=False))
    assert authorized.status_code == 200
    body = authorized.json()
    assert body["org_id"] == test_ctx.org_id
    assert body["role"] == "owner"
    assert body["api_key_prefix"].startswith("cck_")
    assert body["actor_user_id"] is not None


def test_list_org_projects_with_key(client, test_ctx: TestContext) -> None:
    response = client.get(f"/orgs/{test_ctx.org_id}/projects", headers=auth_headers(test_ctx, role="viewer"))
    assert response.status_code == 200
    projects = response.json()
    assert isinstance(projects, list)
    assert any(item["id"] == test_ctx.project_id for item in projects)


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_create_org_project_allowed_for_owner_admin(client, test_ctx: TestContext, role: str) -> None:
    response = client.post(
        f"/orgs/{test_ctx.org_id}/projects",
        headers=auth_headers(test_ctx, role=role),
        json={"name": f"Project by {role}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["org_id"] == test_ctx.org_id
    assert body["name"] == f"Project by {role}"


@pytest.mark.parametrize("role", ["member", "owner"])
def test_create_memory_allowed_for_member_owner(client, test_ctx: TestContext, role: str) -> None:
    response = client.post(
        f"/projects/{test_ctx.project_id}/memories",
        headers=auth_headers(test_ctx, role=role),
        json={"type": "finding", "content": f"Memory added by {role}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == test_ctx.project_id
    assert body["type"] == "finding"


def test_recall_returns_rank_score_for_fts_matches(client, test_ctx: TestContext) -> None:
    first = client.post(
        f"/projects/{test_ctx.project_id}/memories",
        headers=auth_headers(test_ctx, role="owner"),
        json={"type": "finding", "content": "Database migrations with alembic improve reliability."},
    )
    assert first.status_code == 201

    second = client.post(
        f"/projects/{test_ctx.project_id}/memories",
        headers=auth_headers(test_ctx, role="owner"),
        json={"type": "note", "content": "General note unrelated to migration ranking."},
    )
    assert second.status_code == 201

    recall = client.get(
        f"/projects/{test_ctx.project_id}/recall",
        headers=auth_headers(test_ctx, role="viewer"),
        params={"query": "alembic migrations reliability", "limit": 5},
    )
    assert recall.status_code == 200
    items = recall.json()["items"]
    assert len(items) >= 1
    assert items[0]["rank_score"] is not None
    assert "migration" in items[0]["content"].lower() or "alembic" in items[0]["content"].lower()
