from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import uuid
from datetime import timedelta

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analyzer.algorithm import build_vector_candidate_stmt
from app.auth_utils import hash_token, now_utc
from app.db import hash_api_key
from app.ingestion.pipeline import IngestionConfig, ingest_path_incremental
from app.models import (
    ApiKey,
    AuditLog,
    AuthMagicLink,
    AuthUser,
    BatchActionRun,
    InboxItem,
    Membership,
    Memory,
    MemoryEmbedding,
    Organization,
    Project,
    RawCapture,
    RecallLog,
    ContextCompilation,
    ContextCompilationItem,
    QueryProfile,
    Tag,
    RetrievalFeedback,
    UsageCounter,
    User,
    MemoryTag,
)
from app.seed import seed
from .conftest import Ctx, auth_headers, login_via_magic_link, session_auth_headers

pytestmark = pytest.mark.asyncio


async def _login_org_member(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    *,
    role: str,
    is_admin: bool = False,
    org_id: int | None = None,
) -> dict[str, str]:
    await client.post("/auth/logout")
    verify = await login_via_magic_link(
        client,
        db_session,
        email=app_ctx.users[role],
        is_admin=is_admin,
    )
    assert verify.status_code == 200
    return session_auth_headers(org_id=app_ctx.org_id if org_id is None else org_id)


async def _login_session(
    client,
    db_session: AsyncSession,
    *,
    email: str,
    is_admin: bool = False,
    org_id: int | None = None,
) -> dict[str, str]:
    await client.post("/auth/logout")
    verify = await login_via_magic_link(
        client,
        db_session,
        email=email,
        is_admin=is_admin,
    )
    assert verify.status_code == 200
    return session_auth_headers(org_id=org_id)


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


async def test_api_key_org_header_mismatch_returns_forbidden(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    other_org = Organization(name=f"Header Mismatch Org {uuid.uuid4().hex[:6]}")
    db_session.add(other_org)
    await db_session.commit()

    headers = auth_headers(app_ctx, role="owner")
    headers["X-Org-Id"] = str(other_org.id)
    response = await client.get("/me", headers=headers)
    assert response.status_code == 403


async def test_session_auth_org_header_mismatch_returns_forbidden(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    other_org = Organization(name=f"Session Header Mismatch Org {uuid.uuid4().hex[:6]}")
    db_session.add(other_org)
    await db_session.commit()

    headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        org_id=other_org.id,
    )
    response = await client.get("/me", headers=headers)
    assert response.status_code == 403


async def test_invalid_session_cookie_with_org_header_returns_401(client, app_ctx: Ctx) -> None:
    client.cookies.set("contextcache_session", "not-a-real-session")
    response = await client.get("/me", headers={"X-Org-Id": str(app_ctx.org_id)})
    assert response.status_code == 401


async def test_create_org_returns_503_when_write_limiter_backend_unavailable(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    monkeypatch.setattr(
        "app.routes.check_write_limits",
        lambda *_args, **_kwargs: (False, "Service unavailable. Rate limiter backend is unavailable."),
    )

    response = await client.post("/orgs", headers=headers, json={"name": "Blocked Org"})
    assert response.status_code == 503
    assert response.json()["detail"] == "Service unavailable. Rate limiter backend is unavailable."


async def test_ingest_returns_503_when_limiter_backend_unavailable(
    client,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.ingest_routes.check_ingest_limits",
        lambda *_args, **_kwargs: (False, "Service unavailable. Rate limiter backend is unavailable."),
    )

    response = await client.post(
        "/ingest/raw",
        headers=auth_headers(app_ctx, role="owner"),
        json={
            "project_id": app_ctx.project_id,
            "source": "cli",
            "payload": {"text": "backend unavailable"},
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Service unavailable. Rate limiter backend is unavailable."


async def test_me_orgs_lists_all_memberships_for_session_user(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_email = app_ctx.users["owner"]
    owner_user = (
        await db_session.execute(
            select(User).where(User.email == owner_email).limit(1)
        )
    ).scalar_one()

    second_org = Organization(name=f"Second Org {uuid.uuid4().hex[:6]}")
    db_session.add(second_org)
    await db_session.flush()
    db_session.add(Membership(org_id=second_org.id, user_id=owner_user.id, role="member"))

    raw_token = f"tok_orgs_{uuid.uuid4().hex}"
    db_session.add(
        AuthMagicLink(
            email=owner_email,
            token_hash=hash_token(raw_token),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()

    verify = await client.get(f"/auth/verify?token={raw_token}")
    assert verify.status_code == 200

    orgs_resp = await client.get("/me/orgs")
    assert orgs_resp.status_code == 200
    org_ids = {row["id"] for row in orgs_resp.json()}
    assert app_ctx.org_id in org_ids
    assert second_org.id in org_ids


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
async def test_create_org_project_allowed_for_owner_admin(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    role: str,
) -> None:
    headers = await _login_org_member(client, db_session, app_ctx, role=role)
    response = await client.post(
        f"/orgs/{app_ctx.org_id}/projects",
        headers=headers,
        json={"name": f"Project by {role}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["org_id"] == app_ctx.org_id
    assert body["name"] == f"Project by {role}"


async def test_membership_routes_require_owner(client, db_session: AsyncSession, app_ctx: Ctx) -> None:
    member_headers = await _login_org_member(client, db_session, app_ctx, role="member")
    forbidden = await client.get(
        f"/orgs/{app_ctx.org_id}/memberships",
        headers=member_headers,
    )
    assert forbidden.status_code == 403

    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    allowed = await client.get(
        f"/orgs/{app_ctx.org_id}/memberships",
        headers=owner_headers,
    )
    assert allowed.status_code == 200
    assert len(allowed.json()) >= 1


@pytest.mark.parametrize("role", ["member", "owner"])
async def test_create_memory_allowed_for_member_owner(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    role: str,
) -> None:
    headers = await _login_org_member(client, db_session, app_ctx, role=role)
    response = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=headers,
        json={"type": "finding", "content": f"Memory added by {role}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == app_ctx.project_id
    assert body["type"] == "finding"


async def test_recall_returns_rank_score_for_fts_matches(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    first = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=owner_headers,
        json={"type": "finding", "content": "Database migrations with alembic improve reliability."},
    )
    assert first.status_code == 201

    second = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=owner_headers,
        json={"type": "note", "content": "General note unrelated to migration ranking."},
    )
    assert second.status_code == 201

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    recall = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "alembic migrations reliability", "limit": 5},
    )
    assert recall.status_code == 200
    items = recall.json()["items"]
    assert len(items) >= 1
    assert items[0]["rank_score"] is not None


async def test_recall_returns_503_when_private_engine_raises(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    from app.analyzer import algorithm as analyzer_algorithm

    analyzer_algorithm.reset_private_engine_runtime_state()

    async def _boom(*args, **kwargs):
        raise ValueError("ambiguous vector truthiness")

    monkeypatch.setattr("app.analyzer.algorithm._private_run_hybrid_rag_recall", _boom)

    try:
        owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
        create_resp = await client.post(
            f"/projects/{app_ctx.project_id}/memories",
            headers=owner_headers,
            json={"type": "finding", "content": "Configured engine failures should fail closed."},
        )
        assert create_resp.status_code == 201

        viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
        recall = await client.get(
            f"/projects/{app_ctx.project_id}/recall",
            headers=viewer_headers,
            params={"query": "engine failure", "limit": 5},
        )
        assert recall.status_code == 503
        assert "temporarily unavailable" in recall.json()["detail"].lower()

        admin_headers = await _login_org_member(
            client,
            db_session,
            app_ctx,
            role="owner",
            is_admin=True,
        )
        status_resp = await client.get("/admin/system/engine-status", headers=admin_headers)
        assert status_resp.status_code == 200
        status_body = status_resp.json()
        assert status_body["configured"] is True
        assert status_body["mode"] == "circuit_open"
        assert status_body["circuit_open"] is True
        assert status_body["last_error_type"] == "ValueError"
    finally:
        analyzer_algorithm.reset_private_engine_runtime_state()


async def test_local_recall_fallback_caps_candidate_set(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    from app.analyzer import algorithm as analyzer_algorithm

    analyzer_algorithm.reset_private_engine_runtime_state()
    monkeypatch.setattr("app.analyzer.algorithm._private_run_hybrid_rag_recall", None)
    monkeypatch.setattr("app.analyzer.algorithm.LOCAL_RECALL_FALLBACK_MAX_MEMORIES", 5)

    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    for idx in range(8):
        create_resp = await client.post(
            f"/projects/{app_ctx.project_id}/memories",
            headers=owner_headers,
            json={"type": "finding", "content": f"Important fallback detail {idx}"},
        )
        assert create_resp.status_code == 201

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    recall = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "important fallback", "limit": 5},
    )
    assert recall.status_code == 200
    assert len(recall.json()["items"]) >= 1

    recall_log = (
        await db_session.execute(
            select(RecallLog)
            .where(RecallLog.project_id == app_ctx.project_id)
            .order_by(RecallLog.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert recall_log.score_details_json["source"] == "local-fallback"
    assert recall_log.score_details_json["candidate_count"] == 5
    assert recall_log.score_details_json["fallback_max_memories"] == 5
    assert len(recall_log.input_memory_ids) == 5


async def test_recall_uses_recency_fallback_when_no_hybrid_match(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=owner_headers,
        json={"type": "note", "content": "Short memory for fallback behavior."},
    )
    assert create_resp.status_code == 201

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    recall = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "zzzxxyyqqqvvmn unusualtoken", "limit": 5},
    )
    assert recall.status_code == 200
    items = recall.json()["items"]
    assert len(items) >= 1
    assert items[0]["rank_score"] is None


async def test_recall_cag_toon_format_returns_pack_without_crashing(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    from app.analyzer.cag import CAGAnswer

    monkeypatch.setattr("app.routes.is_local_cag", lambda: True)
    monkeypatch.setattr(
        "app.routes.maybe_answer_from_cache",
        lambda query: CAGAnswer(
            source="test-cache",
            score=0.97,
            snippets=["First cached snippet", "Second cached snippet"],
            kv_cache_id="kv-test-123",
            memory_matrix=[[0.1, 0.2]],
        ),
    )

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    recall = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "cached answer", "limit": 5, "format": "toon"},
    )
    assert recall.status_code == 200
    assert recall.headers["X-ContextCache-Recall-Served-By"] == "cag"
    body = recall.json()
    assert body["memory_pack_text"].startswith("Memories[2] { type, content }:")
    assert body["global_kv_cache_id"] == "kv-test-123"


async def test_create_memory_persists_embedding_vectors(
    client,
    app_ctx: Ctx,
    db_session: AsyncSession,
) -> None:
    response = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "finding", "content": "Embedding vector persistence test"},
    )
    assert response.status_code == 201
    memory_id = response.json()["id"]

    memory = (await db_session.execute(select(Memory).where(Memory.id == memory_id).limit(1))).scalar_one()
    assert memory.search_vector is not None
    assert memory.embedding_vector is not None


async def test_update_memory_clears_contextualization_and_requeues_embedding(
    client,
    app_ctx: Ctx,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    queued: list[int] = []

    def _record_enqueue(task_fn, *args, **kwargs):
        queued.append(args[0])
        return None

    monkeypatch.setattr("app.worker.tasks._enqueue_if_enabled", _record_enqueue)

    create = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "finding", "title": "Before", "content": "Original content"},
    )
    assert create.status_code == 201
    memory_id = create.json()["id"]
    queued.clear()

    memory = (await db_session.execute(select(Memory).where(Memory.id == memory_id).limit(1))).scalar_one()
    memory.metadata_json = {"ollama_context": {"model": "llama3.1", "response": "stale"}}
    db_session.add(
        MemoryEmbedding(
            memory_id=memory_id,
            model="text-embedding-3-small",
            model_name="text-embedding-3-small",
            model_version="v1",
            confidence=1.0,
            dims=3,
            metadata_json={"contextualized": True, "context_model": "llama3.1", "provider": "local"},
        )
    )
    await db_session.commit()

    update = await client.patch(
        f"/projects/{app_ctx.project_id}/memories/{memory_id}",
        headers=auth_headers(app_ctx, role="owner"),
        json={"title": "After", "content": "Updated content"},
    )
    assert update.status_code == 200
    body = update.json()
    assert "ollama_context" not in body["metadata"]

    await db_session.refresh(memory)
    refreshed = memory
    assert "ollama_context" not in (refreshed.metadata_json or {})

    emb_row = (
        await db_session.execute(select(MemoryEmbedding).where(MemoryEmbedding.memory_id == memory_id).limit(1))
    ).scalar_one()
    await db_session.refresh(emb_row)
    assert "contextualized" not in (emb_row.metadata_json or {})
    assert "context_model" not in (emb_row.metadata_json or {})
    assert queued == [memory_id]


async def test_cleanup_old_usage_counters_rejects_non_positive_retention(
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
    client,
) -> None:
    from app.worker.tasks import cleanup_old_usage_counters

    monkeypatch.setattr("app.worker.tasks.WORKER_ENABLED", True)
    await _login_org_member(client, db_session, app_ctx, role="owner")

    owner_auth = (
        await db_session.execute(
            select(AuthUser).where(AuthUser.email == app_ctx.users["owner"]).limit(1)
        )
    ).scalar_one()
    old_row = UsageCounter(
        user_id=owner_auth.id,
        day=now_utc().date() - timedelta(days=120),
        memories_created=7,
        recall_queries=3,
        projects_created=1,
    )
    db_session.add(old_row)
    await db_session.commit()

    result = await asyncio.to_thread(cleanup_old_usage_counters.run, 0)
    assert result["status"] == "invalid"
    assert result["retain_days"] == 0

    still_present = (
        await db_session.execute(select(UsageCounter).where(UsageCounter.id == old_row.id).limit(1))
    ).scalar_one_or_none()
    assert still_present is not None


async def test_usage_includes_weekly_fields(client, db_session: AsyncSession, app_ctx: Ctx) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    response = await client.get("/me/usage", headers=owner_headers)
    assert response.status_code == 200
    body = response.json()
    assert "week_start" in body
    assert "weekly_memories_created" in body
    assert "weekly_recall_queries" in body
    assert "weekly_projects_created" in body


async def test_usage_weekly_totals_are_derived_from_db_counters(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    owner_auth = (
        await db_session.execute(
            select(AuthUser).where(AuthUser.email == app_ctx.users["owner"]).limit(1)
        )
    ).scalar_one()

    today = now_utc().date()
    week_start = today - timedelta(days=today.weekday())
    db_session.add(
        UsageCounter(
            user_id=owner_auth.id,
            day=today,
            memories_created=2,
            recall_queries=1,
            projects_created=1,
        )
    )
    if week_start != today:
        db_session.add(
            UsageCounter(
                user_id=owner_auth.id,
                day=week_start,
                memories_created=3,
                recall_queries=4,
                projects_created=0,
            )
        )
    else:
        current = (
            await db_session.execute(
                select(UsageCounter)
                .where(UsageCounter.user_id == owner_auth.id, UsageCounter.day == today)
                .limit(1)
            )
        ).scalar_one()
        current.memories_created = 5
        current.recall_queries = 5
        current.projects_created = 1
    await db_session.commit()

    response = await client.get("/me/usage", headers=owner_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["weekly_memories_created"] == 5
    assert body["weekly_recall_queries"] == 5
    assert body["weekly_projects_created"] == 1


async def test_usage_limits_are_zeroed_for_unlimited_user(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    owner_auth = (
        await db_session.execute(
            select(AuthUser).where(AuthUser.email == app_ctx.users["owner"]).limit(1)
        )
    ).scalar_one()
    owner_auth.is_unlimited = True
    await db_session.commit()

    response = await client.get("/me/usage", headers=owner_headers)
    assert response.status_code == 200
    assert response.json()["limits"] == {
        "memories_per_day": 0,
        "recalls_per_day": 0,
        "projects_per_day": 0,
        "memories_per_week": 0,
        "recalls_per_week": 0,
        "projects_per_week": 0,
    }


async def test_user_plan_change_applies_to_next_org_creation(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    owner_auth = (
        await db_session.execute(
            select(AuthUser).where(AuthUser.email == app_ctx.users["owner"]).limit(1)
        )
    ).scalar_one()
    admin_headers = await _login_session(
        client,
        db_session,
        email="plan-admin@example.com",
        is_admin=True,
    )

    upgrade = await client.post(
        f"/admin/users/{owner_auth.id}/set-plan?plan_code=pro",
        headers=admin_headers,
    )
    assert upgrade.status_code == 200

    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")

    for idx in range(3):
        create = await client.post(
            "/orgs",
            headers=owner_headers,
            json={"name": f"Plan Org {idx}"},
        )
        assert create.status_code == 201

    admin_headers = await _login_session(
        client,
        db_session,
        email="plan-admin@example.com",
        is_admin=True,
    )

    downgrade = await client.post(
        f"/admin/users/{owner_auth.id}/set-plan?plan_code=free",
        headers=admin_headers,
    )
    assert downgrade.status_code == 200

    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")

    blocked = await client.post(
        "/orgs",
        headers=owner_headers,
        json={"name": "Plan Org blocked"},
    )
    assert blocked.status_code == 403
    assert "max 3 organizations" in blocked.json()["detail"]


async def test_org_plan_change_applies_to_next_api_key_creation(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_session(
        client,
        db_session,
        email="plan-admin@example.com",
        is_admin=True,
    )

    upgrade = await client.post(
        f"/admin/orgs/{app_ctx.org_id}/set-plan?plan_code=team",
        headers=admin_headers,
    )
    assert upgrade.status_code == 200

    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")

    for idx in range(3):
        create = await client.post(
            f"/orgs/{app_ctx.org_id}/api-keys",
            headers=owner_headers,
            json={"name": f"extra-key-{idx}"},
        )
        assert create.status_code == 201

    admin_headers = await _login_session(
        client,
        db_session,
        email="plan-admin@example.com",
        is_admin=True,
    )

    downgrade = await client.post(
        f"/admin/orgs/{app_ctx.org_id}/set-plan?plan_code=free",
        headers=admin_headers,
    )
    assert downgrade.status_code == 200

    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")

    blocked = await client.post(
        f"/orgs/{app_ctx.org_id}/api-keys",
        headers=owner_headers,
        json={"name": "blocked-key"},
    )
    assert blocked.status_code == 403
    assert "max 3 active API keys" in blocked.json()["detail"]


async def test_contextualize_endpoint_returns_queued(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    create_response = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=owner_headers,
        json={"type": "note", "content": "Queue contextualization"},
    )
    assert create_response.status_code == 201
    memory_id = create_response.json()["id"]

    member_headers = await _login_org_member(client, db_session, app_ctx, role="member")
    response = await client.post(
        f"/integrations/memories/{memory_id}/contextualize",
        headers=member_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "queued"


async def test_contextualize_worker_is_idempotent_for_existing_context(
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    from app.worker.tasks import contextualize_memory_with_ollama

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return b'{"response":"Fresh context"}'

    calls: list[str] = []

    def _fake_urlopen(req, timeout=20):
        calls.append(req.full_url)
        return _FakeResponse()

    monkeypatch.setattr("app.worker.tasks.WORKER_ENABLED", True)
    monkeypatch.setattr("urllib.request.urlopen", _fake_urlopen)

    memory = Memory(
        project_id=app_ctx.project_id,
        type="note",
        source="manual",
        content="Context me once",
        metadata_json={},
    )
    db_session.add(memory)
    await db_session.commit()

    first = await asyncio.to_thread(contextualize_memory_with_ollama.run, memory.id)
    assert first["status"] == "ok"

    second = await asyncio.to_thread(contextualize_memory_with_ollama.run, memory.id)
    assert second["status"] == "already_contextualized"
    assert calls == ["http://ollama:11434/api/generate"]

    await db_session.refresh(memory)
    assert memory.metadata_json["ollama_context"]["response"] == "Fresh context"


async def test_cag_hit_short_circuits_before_rag_in_hedged_mode(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    from app.analyzer.cag import CAGAnswer

    monkeypatch.setattr("app.routes.is_local_cag", lambda: False)
    monkeypatch.setattr("app.routes._resolve_hedge_delay_ms", lambda org_id: 250)

    async def _fast_cag(_query_text: str):
        return (
            CAGAnswer(
                source="hedged-cache",
                score=0.88,
                snippets=["Fast snippet"],
                kv_cache_id="kv-fast",
                memory_matrix=None,
            ),
            5,
        )

    async def _boom_rag(*args, **kwargs):
        raise AssertionError("RAG should not run when CAG answers within hedge delay")

    monkeypatch.setattr("app.routes._timed_cag_lookup", _fast_cag)
    monkeypatch.setattr("app.routes._run_rag_recall", _boom_rag)

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    recall = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "hedged cache hit", "limit": 5},
    )
    assert recall.status_code == 200
    assert recall.headers["X-ContextCache-Recall-Served-By"] == "cag"
    assert recall.json()["global_kv_cache_id"] == "kv-fast"


async def test_integrations_list_returns_uploaded_memory(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    create_resp = await client.post(
        "/integrations/memories",
        headers=owner_headers,
        json={
            "project_id": app_ctx.project_id,
            "type": "note",
            "source": "api",
            "content": "Integration list should return this memory.",
            "metadata": {},
            "tags": [],
        },
    )
    assert create_resp.status_code == 201

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    listed = await client.get(
        "/integrations/memories",
        headers=viewer_headers,
        params={"project_id": app_ctx.project_id, "limit": 20, "offset": 0},
    )
    assert listed.status_code == 200
    rows = listed.json()
    assert any(row["content"] == "Integration list should return this memory." for row in rows)


async def test_integrations_capabilities_returns_stable_contract(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    response = await client.get(
        "/integrations/capabilities",
        headers=viewer_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["api_version"]
    assert body["auth_modes"] == ["session", "api_key", "bearer"]
    assert body["ingest_sources"] == ["chrome_ext", "cli", "mcp", "email"]
    assert body["recall_formats"] == ["text", "toon", "toonx", "auto"]
    assert body["supports_batch_undo"] == ["add_tag", "pin", "remove_tag", "unpin"]
    assert body["supports_idempotency"] is True
    assert body["supports_ingest_replay"] is True


async def test_ingest_raw_idempotency_reuses_existing_capture(client, app_ctx: Ctx, monkeypatch) -> None:
    monkeypatch.setattr("app.ingest_routes._WORKER_ENABLED", False)

    headers = auth_headers(app_ctx, role="owner")
    headers["Idempotency-Key"] = "cap-dup-1"
    payload = {
        "project_id": app_ctx.project_id,
        "source": "cli",
        "payload": {"text": "duplicate capture"},
    }

    first = await client.post("/ingest/raw", headers=headers, json=payload)
    assert first.status_code == 202
    second = await client.post("/ingest/raw", headers=headers, json=payload)
    assert second.status_code == 202
    assert second.json()["capture_id"] == first.json()["capture_id"]
    assert second.json()["duplicate"] is True


async def test_ingest_capture_status_and_replay(client, app_ctx: Ctx, db_session: AsyncSession, monkeypatch) -> None:
    monkeypatch.setattr("app.ingest_routes._WORKER_ENABLED", False)

    async def _fail_inline(db, capture):
        raise RuntimeError("simulated refinery failure")

    monkeypatch.setattr("app.ingest_routes._run_refinery_inline", _fail_inline)

    create = await client.post(
        "/ingest/raw",
        headers=auth_headers(app_ctx, role="owner"),
        json={
            "project_id": app_ctx.project_id,
            "source": "cli",
            "payload": {"text": "needs replay"},
        },
    )
    assert create.status_code == 202
    capture_id = create.json()["capture_id"]
    assert create.json()["processing_status"] == "dead_letter"

    status = await client.get(
        f"/ingest/raw/{capture_id}",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert status.status_code == 200
    assert status.json()["processing_status"] == "dead_letter"
    assert "simulated refinery failure" in (status.json()["last_error"] or "")

    async def _recover_inline(db, capture):
        capture.processed_at = now_utc()
        capture.processing_status = "processed"
        capture.last_error = None
        capture.last_error_at = None
        capture.dead_lettered_at = None
        return 1

    monkeypatch.setattr("app.ingest_routes._run_refinery_inline", _recover_inline)

    replay = await client.post(
        f"/ingest/raw/{capture_id}/replay",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert replay.status_code == 202
    assert replay.json()["processing_status"] == "processed"

    refreshed = (
        await db_session.execute(select(RawCapture).where(RawCapture.id == capture_id).limit(1))
    ).scalar_one()
    assert refreshed.processing_status == "processed"

    audit_actions = (
        await db_session.execute(
            select(AuditLog.action).where(AuditLog.org_id == app_ctx.org_id).order_by(AuditLog.id.asc())
        )
    ).scalars().all()
    assert "ingest.capture_failed" in audit_actions
    assert "ingest.capture_replayed" in audit_actions


@pytest.mark.parametrize("status", ["queued", "processing"])
async def test_ingest_replay_rejects_non_terminal_capture_status(
    client,
    app_ctx: Ctx,
    db_session: AsyncSession,
    status: str,
) -> None:
    capture = RawCapture(
        org_id=app_ctx.org_id,
        project_id=app_ctx.project_id,
        source="cli",
        payload={"text": f"status {status}"},
        processing_status=status,
        processing_started_at=now_utc() if status == "processing" else None,
    )
    db_session.add(capture)
    await db_session.commit()

    replay = await client.post(
        f"/ingest/raw/{capture.id}/replay",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert replay.status_code == 409
    assert "failed or dead_letter" in replay.json()["detail"]


async def test_ingest_worker_enqueue_failure_marks_capture_failed(
    client,
    app_ctx: Ctx,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.ingest_routes._WORKER_ENABLED", True)

    def _boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr("app.worker.tasks._enqueue_if_enabled", _boom)

    create = await client.post(
        "/ingest/raw",
        headers=auth_headers(app_ctx, role="owner"),
        json={
            "project_id": app_ctx.project_id,
            "source": "cli",
            "payload": {"text": "queue me"},
        },
    )
    assert create.status_code == 202
    body = create.json()
    assert body["status"] == "failed"
    assert body["processing_status"] == "failed"

    capture = (
        await db_session.execute(select(RawCapture).where(RawCapture.id == body["capture_id"]).limit(1))
    ).scalar_one()
    assert capture.processing_status == "failed"
    assert "broker unavailable" in (capture.last_error or "")

    failed_audit = (
        await db_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "ingest.capture_failed", AuditLog.entity_id == capture.id)
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert failed_audit.metadata_json["mode"] == "worker-enqueue"


async def test_replay_worker_enqueue_failure_marks_capture_failed(
    client,
    app_ctx: Ctx,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.ingest_routes._WORKER_ENABLED", True)

    def _boom(*args, **kwargs):
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr("app.worker.tasks._enqueue_if_enabled", _boom)

    capture = RawCapture(
        org_id=app_ctx.org_id,
        project_id=app_ctx.project_id,
        source="cli",
        payload={"text": "retry me"},
        processing_status="failed",
        attempt_count=1,
        last_error="previous error",
        last_error_at=now_utc(),
    )
    db_session.add(capture)
    await db_session.commit()

    replay = await client.post(
        f"/ingest/raw/{capture.id}/replay",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert replay.status_code == 202
    body = replay.json()
    assert body["status"] == "failed"
    assert body["processing_status"] == "failed"

    await db_session.refresh(capture)
    assert capture.processing_status == "failed"
    assert "broker unavailable" in (capture.last_error or "")

    failed_audit = (
        await db_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "ingest.capture_failed", AuditLog.entity_id == capture.id)
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert failed_audit.metadata_json["mode"] == "worker-replay-enqueue"


async def test_ingest_capture_org_isolation_returns_not_found(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    other_org = Organization(name=f"Capture Isolation Org {uuid.uuid4().hex[:6]}")
    db_session.add(other_org)
    await db_session.flush()
    outsider = User(email=f"capture-isolated-{uuid.uuid4().hex[:6]}@example.com", display_name="Capture Isolated")
    db_session.add(outsider)
    await db_session.flush()
    db_session.add(Membership(org_id=other_org.id, user_id=outsider.id, role="owner"))
    isolated_project = Project(name="Capture Isolation Project", org_id=other_org.id, created_by_user_id=outsider.id)
    db_session.add(isolated_project)
    await db_session.flush()
    capture = RawCapture(
        org_id=other_org.id,
        project_id=isolated_project.id,
        source="cli",
        payload={"text": "isolated capture"},
        processing_status="failed",
    )
    db_session.add(capture)
    await db_session.commit()

    status = await client.get(
        f"/ingest/raw/{capture.id}",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert status.status_code == 404

    replay = await client.post(
        f"/ingest/raw/{capture.id}/replay",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert replay.status_code == 404


async def test_ingest_rejects_cross_org_project_reference(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    other_org = Organization(name=f"Ingest Cross Org {uuid.uuid4().hex[:6]}")
    db_session.add(other_org)
    await db_session.flush()
    outsider = User(email=f"ingest-cross-org-{uuid.uuid4().hex[:6]}@example.com", display_name="Cross Org")
    db_session.add(outsider)
    await db_session.flush()
    db_session.add(Membership(org_id=other_org.id, user_id=outsider.id, role="owner"))
    isolated_project = Project(name="Cross Org Project", org_id=other_org.id, created_by_user_id=outsider.id)
    db_session.add(isolated_project)
    await db_session.commit()

    response = await client.post(
        "/ingest/raw",
        headers=auth_headers(app_ctx, role="owner"),
        json={
            "project_id": isolated_project.id,
            "source": "cli",
            "payload": {"text": "should be rejected"},
        },
    )
    assert response.status_code == 404


async def test_ingest_inline_skips_malformed_refinery_drafts(
    client,
    app_ctx: Ctx,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.ingest_routes._WORKER_ENABLED", False)
    monkeypatch.setattr(
        "app.worker.tasks.refine_content_with_llm",
        lambda _payload: [
            "not-a-dict",
            {"type": "note", "title": "Bad confidence", "content": "still valid", "confidence_score": "bad"},
            {"type": "note", "title": "Empty", "content": "   "},
        ],
    )

    create = await client.post(
        "/ingest/raw",
        headers=auth_headers(app_ctx, role="owner"),
        json={
            "project_id": app_ctx.project_id,
            "source": "cli",
            "payload": {"text": "malformed draft handling"},
        },
    )
    assert create.status_code == 202

    capture = (
        await db_session.execute(select(RawCapture).where(RawCapture.id == create.json()["capture_id"]).limit(1))
    ).scalar_one()
    assert capture.processing_status == "processed"

    inbox_items = (
        await db_session.execute(select(InboxItem).where(InboxItem.raw_capture_id == capture.id))
    ).scalars().all()
    assert len(inbox_items) == 1
    assert inbox_items[0].suggested_content == "still valid"


async def test_integrations_memory_endpoints_are_org_scoped(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    other_org = Organization(name=f"Integration Isolation Org {uuid.uuid4().hex[:6]}")
    db_session.add(other_org)
    await db_session.flush()
    outsider = User(email=f"integration-isolated-{uuid.uuid4().hex[:6]}@example.com", display_name="Integration Isolated")
    db_session.add(outsider)
    await db_session.flush()
    db_session.add(Membership(org_id=other_org.id, user_id=outsider.id, role="owner"))
    isolated_project = Project(name="Integration Isolation Project", org_id=other_org.id, created_by_user_id=outsider.id)
    db_session.add(isolated_project)
    await db_session.flush()
    isolated_memory = Memory(
        project_id=isolated_project.id,
        created_by_user_id=outsider.id,
        type="note",
        source="manual",
        content="isolated integration memory",
    )
    db_session.add(isolated_memory)
    await db_session.commit()

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    listed = await client.get(
        "/integrations/memories",
        headers=viewer_headers,
        params={"project_id": isolated_project.id},
    )
    assert listed.status_code == 404

    member_headers = await _login_org_member(client, db_session, app_ctx, role="member")
    contextualize = await client.post(
        f"/integrations/memories/{isolated_memory.id}/contextualize",
        headers=member_headers,
    )
    assert contextualize.status_code == 404


async def test_api_key_access_requests_are_scoped_and_require_admin_review(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    viewer_create = await client.post(
        f"/orgs/{app_ctx.org_id}/api-key-access-requests",
        headers=viewer_headers,
        json={"reason": "viewer needs export access"},
    )
    assert viewer_create.status_code == 201
    viewer_request_id = viewer_create.json()["id"]

    member_headers = await _login_org_member(client, db_session, app_ctx, role="member")
    member_create = await client.post(
        f"/orgs/{app_ctx.org_id}/api-key-access-requests",
        headers=member_headers,
        json={"reason": "member needs cli access"},
    )
    assert member_create.status_code == 201
    member_request_id = member_create.json()["id"]

    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    viewer_list = await client.get(
        f"/orgs/{app_ctx.org_id}/api-key-access-requests",
        headers=viewer_headers,
    )
    assert viewer_list.status_code == 200
    assert [row["id"] for row in viewer_list.json()] == [viewer_request_id]

    member_headers = await _login_org_member(client, db_session, app_ctx, role="member")
    forbidden = await client.post(
        f"/orgs/{app_ctx.org_id}/api-key-access-requests/{viewer_request_id}/approve",
        headers=member_headers,
        json={"note": "not allowed"},
    )
    assert forbidden.status_code == 403

    admin_headers = await _login_org_member(client, db_session, app_ctx, role="admin")
    admin_list = await client.get(
        f"/orgs/{app_ctx.org_id}/api-key-access-requests",
        headers=admin_headers,
    )
    assert admin_list.status_code == 200
    assert {row["id"] for row in admin_list.json()} == {viewer_request_id, member_request_id}

    approved = await client.post(
        f"/orgs/{app_ctx.org_id}/api-key-access-requests/{viewer_request_id}/approve",
        headers=admin_headers,
        json={"note": "approved for tooling"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    viewer_user = (
        await db_session.execute(select(User).where(User.email == app_ctx.users["viewer"]).limit(1))
    ).scalar_one()
    updated_membership = (
        await db_session.execute(
            select(Membership).where(Membership.org_id == app_ctx.org_id, Membership.user_id == viewer_user.id).limit(1)
        )
    ).scalar_one()
    assert updated_membership.role == "admin"


async def test_brain_batch_idempotency_and_conflict(client, app_ctx: Ctx) -> None:
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "note", "content": "batch idempotency memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    headers = auth_headers(app_ctx, role="owner")
    headers["Idempotency-Key"] = "batch-pin-1"
    payload = {"actionId": "batch-pin-1", "action": {"type": "pin", "targetIds": [f"mem-{memory_id}"]}}

    first = await client.post("/brain/batch", headers=headers, json=payload)
    assert first.status_code == 200
    second = await client.post("/brain/batch", headers=headers, json=payload)
    assert second.status_code == 200
    assert second.json() == first.json()

    conflict = await client.post(
        "/brain/batch",
        headers=headers,
        json={"actionId": "batch-pin-2", "action": {"type": "unpin", "targetIds": [f"mem-{memory_id}"]}},
    )
    assert conflict.status_code == 409


async def test_brain_batch_limit_and_undo(client, app_ctx: Ctx, db_session: AsyncSession, monkeypatch) -> None:
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "note", "content": "undo memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    monkeypatch.setattr("app.routes.BRAIN_BATCH_MAX_TARGETS", 1)
    too_many = await client.post(
        "/brain/batch",
        headers=auth_headers(app_ctx, role="owner"),
        json={"actionId": "batch-too-many", "action": {"type": "pin", "targetIds": [f"mem-{memory_id}", "mem-999999"]}},
    )
    assert too_many.status_code == 413

    pin_payload = {"actionId": "batch-pin-undo", "action": {"type": "pin", "targetIds": [f"mem-{memory_id}"]}}
    pin = await client.post("/brain/batch", headers=auth_headers(app_ctx, role="owner"), json=pin_payload)
    assert pin.status_code == 200
    assert pin.json()["undoAvailable"] is True

    memory = (await db_session.execute(select(Memory).where(Memory.id == memory_id).limit(1))).scalar_one()
    assert memory.metadata_json.get("pinned") is True

    undo = await client.post(
        "/brain/batch/batch-pin-undo/undo",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert undo.status_code == 200

    await db_session.refresh(memory)
    assert memory.metadata_json.get("pinned") is False

    second_undo = await client.post(
        "/brain/batch/batch-pin-undo/undo",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert second_undo.status_code == 409

    audit_actions = (
        await db_session.execute(
            select(AuditLog.action).where(AuditLog.org_id == app_ctx.org_id).order_by(AuditLog.id.asc())
        )
    ).scalars().all()
    assert "brain.batch" in audit_actions
    assert "brain.batch.undo" in audit_actions


async def test_brain_batch_partial_undo_does_not_mark_original_run_undone(
    client,
    app_ctx: Ctx,
    db_session: AsyncSession,
) -> None:
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "note", "content": "tag undo memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    add_tag = await client.post(
        "/brain/batch",
        headers=auth_headers(app_ctx, role="owner"),
        json={
            "actionId": "batch-add-tag-partial",
            "action": {"type": "add_tag", "targetIds": [f"mem-{memory_id}"], "tagId": "important"},
        },
    )
    assert add_tag.status_code == 200
    assert add_tag.json()["failed"] == 0

    tag = (
        await db_session.execute(
            select(Tag).where(Tag.project_id == app_ctx.project_id, Tag.name == "important").limit(1)
        )
    ).scalar_one()
    await db_session.execute(delete(MemoryTag).where(MemoryTag.tag_id == tag.id))
    await db_session.commit()
    await db_session.delete(tag)
    await db_session.commit()

    undo = await client.post(
        "/brain/batch/batch-add-tag-partial/undo",
        headers=auth_headers(app_ctx, role="owner"),
    )
    assert undo.status_code == 200
    assert undo.json()["failed"] == 1

    original = (
        await db_session.execute(
            select(BatchActionRun)
            .where(BatchActionRun.org_id == app_ctx.org_id, BatchActionRun.action_id == "batch-add-tag-partial")
            .limit(1)
        )
    ).scalar_one()
    assert original.status == "completed"


async def test_brain_batch_org_isolation_returns_not_found(client, db_session: AsyncSession, app_ctx: Ctx) -> None:
    other_org = Organization(name=f"Isolated Org {uuid.uuid4().hex[:6]}")
    db_session.add(other_org)
    await db_session.flush()
    outsider = User(email=f"isolated-{uuid.uuid4().hex[:6]}@example.com", display_name="Isolated")
    db_session.add(outsider)
    await db_session.flush()
    db_session.add(Membership(org_id=other_org.id, user_id=outsider.id, role="owner"))
    project = Project(name="Isolated Project", org_id=other_org.id, created_by_user_id=outsider.id)
    db_session.add(project)
    await db_session.flush()
    memory = Memory(project_id=project.id, created_by_user_id=outsider.id, type="note", source="manual", content="isolated")
    db_session.add(memory)
    await db_session.commit()

    response = await client.post(
        "/brain/batch",
        headers=auth_headers(app_ctx, role="owner"),
        json={"actionId": "cross-org", "action": {"type": "pin", "targetIds": [f"mem-{memory.id}"]}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["failed"] == 1
    assert body["results"][0]["errorCode"] == "NOT_FOUND"


async def test_delete_org_requires_removing_other_members_first(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")

    project = (
        await db_session.execute(
            select(Project).where(Project.id == app_ctx.project_id).limit(1)
        )
    ).scalar_one()
    await db_session.delete(project)
    await db_session.commit()

    outsider = User(email=f"other-member-{uuid.uuid4().hex[:6]}@local")
    db_session.add(outsider)
    await db_session.flush()
    db_session.add(Membership(org_id=app_ctx.org_id, user_id=outsider.id, role="viewer"))
    await db_session.commit()

    response = await client.delete(f"/orgs/{app_ctx.org_id}", headers=owner_headers)
    assert response.status_code == 409
    assert "other membership" in response.json()["detail"].lower()


async def test_reject_inbox_item_writes_audit_log(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")

    capture = RawCapture(
        org_id=app_ctx.org_id,
        project_id=app_ctx.project_id,
        source="cli",
        payload={"text": "reject me"},
        processing_status="processed",
        processed_at=now_utc(),
    )
    db_session.add(capture)
    await db_session.flush()
    inbox = InboxItem(
        project_id=app_ctx.project_id,
        raw_capture_id=capture.id,
        suggested_type="note",
        suggested_title="Review me",
        suggested_content="Reject this suggestion",
        confidence_score=0.4,
        status="pending",
    )
    db_session.add(inbox)
    await db_session.commit()

    reject = await client.post(f"/inbox/{inbox.id}/reject", headers=owner_headers)
    assert reject.status_code == 200

    audit_row = (
        await db_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "inbox.reject")
            .where(AuditLog.entity_id == inbox.id)
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert audit_row.org_id == app_ctx.org_id
    assert audit_row.entity_type == "inbox_item"


async def test_admin_recall_logs_returns_recent_entries(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=admin_headers,
        json={"type": "decision", "content": "Recall log coverage memory"},
    )
    assert create_resp.status_code == 201

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=admin_headers,
        params={"query": "coverage memory", "limit": 5},
    )
    assert recall_resp.status_code == 200

    logs_resp = await client.get(
        "/admin/recall/logs",
        headers=admin_headers,
        params={"limit": 20, "offset": 0, "project_id": app_ctx.project_id},
    )
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    assert len(logs) >= 1
    assert logs[0]["project_id"] == app_ctx.project_id
    assert logs[0]["strategy"] in {"hybrid", "recency", "cag"}


async def test_recall_persists_context_compilation_with_item_provenance(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "decision", "content": "Compiler persistence memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "compiler persistence", "limit": 5, "format": "toonx"},
    )
    assert recall_resp.status_code == 200
    body = recall_resp.json()
    assert body["renderer"] == "toon-x/v1"
    assert body["mir"]["version"] == "mir/1"
    assert body["mir"]["bundle"]["target_format"] == "toonx"
    assert body["mir"]["bundle"]["bundle_id"].startswith("bundle:")
    assert body["mir"]["retrieval_plan"]["served_by"] in {"rag", "cag"}
    assert body["mir"]["retrieval_plan"]["strategy"] in {"hybrid", "recency", "cag"}

    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "compiler persistence",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert compilation.target_format == "toonx"
    assert compilation.served_by in {"rag", "cag"}
    assert compilation.compilation_json["version"] == "mir/1"
    assert compilation.compilation_json["bundle"]["target_format"] == "toonx"
    assert compilation.compilation_json["bundle"]["item_count"] >= 1
    assert compilation.compilation_json["retrieval_plan"]["served_by"] in {"rag", "cag"}

    item_rows = (
        await db_session.execute(
            select(ContextCompilationItem)
            .where(ContextCompilationItem.compilation_id == compilation.id)
            .order_by(ContextCompilationItem.rank.asc(), ContextCompilationItem.id.asc())
        )
    ).scalars().all()
    assert len(item_rows) >= 1
    assert any(row.entity_id == memory_id for row in item_rows)
    assert any(row.source_kind in {"decision", "fact", "artifact", "next_hop", "unknown"} for row in item_rows)


async def test_recall_persists_text_context_compilation_with_mir_json(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "finding", "content": "Default text compiler persistence memory"},
    )
    assert create_resp.status_code == 201

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "default text compiler", "limit": 5},
    )
    assert recall_resp.status_code == 200
    body = recall_resp.json()
    assert body["renderer"] == "recall-pack/v1"
    assert body["mir"]["version"] == "mir/1"
    assert body["mir"]["renderer"] == "recall-pack/v1"
    assert body["mir"]["bundle"]["target_format"] == "text"
    assert body["mir"]["retrieval_plan"]["served_by"] == "rag"

    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "default text compiler",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert compilation.target_format == "text"
    assert compilation.compilation_json["version"] == "mir/1"
    assert compilation.compilation_json["renderer"] == "recall-pack/v1"
    assert compilation.compilation_json["bundle"]["target_format"] == "text"
    assert compilation.compilation_text == body["memory_pack_text"]


async def test_admin_recall_compilations_returns_recent_entries(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=admin_headers,
        json={"type": "decision", "content": "Compilation listing memory"},
    )
    assert create_resp.status_code == 201

    text_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=admin_headers,
        params={"query": "compilation listing", "limit": 5},
    )
    assert text_resp.status_code == 200
    toonx_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=admin_headers,
        params={"query": "compilation listing", "limit": 5, "format": "toonx"},
    )
    assert toonx_resp.status_code == 200

    response = await client.get(
        "/admin/recall/compilations",
        headers=admin_headers,
        params={"limit": 20, "offset": 0, "project_id": app_ctx.project_id},
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) >= 2
    assert rows[0]["project_id"] == app_ctx.project_id
    assert {row["target_format"] for row in rows} >= {"text", "toonx"}
    assert {row["renderer"] for row in rows if row["renderer"] is not None} >= {"recall-pack/v1", "toon-x/v1"}
    matching_rows = [row for row in rows if row["query_text"] == "compilation listing"]
    assert len(matching_rows) >= 2
    assert all(row["item_count"] >= 1 for row in matching_rows)
    assert all((row["bundle_id"] or "").startswith("bundle:") for row in matching_rows)
    assert {row["retrieval_strategy"] for row in matching_rows if row["retrieval_strategy"] is not None} <= {
        "hybrid",
        "recency",
        "cag",
    }

    toonx_only = await client.get(
        "/admin/recall/compilations",
        headers=admin_headers,
        params={"limit": 20, "offset": 0, "project_id": app_ctx.project_id, "target_format": "toonx"},
    )
    assert toonx_only.status_code == 200
    toonx_rows = toonx_only.json()
    assert toonx_rows
    assert all(row["target_format"] == "toonx" for row in toonx_rows)
    assert all(row["bundle_id"] for row in toonx_rows)


async def test_admin_recall_compilation_detail_returns_artifact_and_items(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=admin_headers,
        json={"type": "decision", "content": "Compilation detail memory"},
    )
    assert create_resp.status_code == 201

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=admin_headers,
        params={"query": "compilation detail", "limit": 5, "format": "toonx"},
    )
    assert recall_resp.status_code == 200

    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "compilation detail",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()

    detail_resp = await client.get(
        f"/admin/recall/compilations/{compilation.id}",
        headers=admin_headers,
    )
    assert detail_resp.status_code == 200
    body = detail_resp.json()
    assert body["id"] == compilation.id
    assert body["target_format"] == "toonx"
    assert body["bundle_id"].startswith("bundle:")
    assert body["renderer"] == "toon-x/v1"
    assert body["retrieval_strategy"] in {"hybrid", "recency", "cag"}
    assert body["compilation_json"]["version"] == "mir/1"
    assert body["items"]
    assert body["item_count"] == len(body["items"])
    assert body["feedback_count"] == 0
    assert body["recent_feedback"] == []
    assert body["query_profile_id"] is not None


async def test_recall_feedback_updates_query_profile_and_persists_feedback(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "decision", "content": "Feedback target memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "feedback target", "limit": 5, "format": "toonx"},
    )
    assert recall_resp.status_code == 200

    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "feedback target",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()

    feedback_resp = await client.post(
        f"/projects/{app_ctx.project_id}/recall/feedback",
        headers=viewer_headers,
        json={
            "compilation_id": compilation.id,
            "label": "helpful",
            "entity_id": memory_id,
            "note": "This was the right memory.",
            "metadata": {"source": "integration-test"},
        },
    )
    assert feedback_resp.status_code == 201
    feedback_body = feedback_resp.json()
    assert feedback_body["compilation_id"] == compilation.id
    assert feedback_body["label"] == "helpful"
    assert feedback_body["entity_id"] == memory_id
    assert feedback_body["query_profile_id"] is not None

    feedback_row = (
        await db_session.execute(
            select(RetrievalFeedback)
            .where(RetrievalFeedback.id == feedback_body["id"])
            .limit(1)
        )
    ).scalar_one()
    assert feedback_row.query_profile_id == feedback_body["query_profile_id"]
    assert feedback_row.metadata_json["source"] == "integration-test"

    query_profile = (
        await db_session.execute(
            select(QueryProfile)
            .where(QueryProfile.id == feedback_body["query_profile_id"])
            .limit(1)
        )
    ).scalar_one()
    assert query_profile.normalized_query == "feedback target"
    assert query_profile.total_queries >= 1
    assert query_profile.helpful_count >= 1
    assert query_profile.preferred_target_format == "toonx"
    assert query_profile.last_compilation_id == compilation.id
    assert query_profile.last_feedback_at is not None

    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    profiles_resp = await client.get(
        "/admin/recall/query-profiles",
        headers=admin_headers,
        params={"project_id": app_ctx.project_id, "limit": 20, "offset": 0},
    )
    assert profiles_resp.status_code == 200
    profiles = profiles_resp.json()
    matching = [row for row in profiles if row["normalized_query"] == "feedback target"]
    assert matching
    assert matching[0]["helpful_count"] >= 1
    assert matching[0]["preferred_target_format"] == "toonx"


async def test_recall_auto_format_uses_query_profile_preference(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "decision", "content": "Auto format preference memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    seed_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "auto format preference", "limit": 5, "format": "toonx"},
    )
    assert seed_resp.status_code == 200

    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "auto format preference",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()

    feedback_resp = await client.post(
        f"/projects/{app_ctx.project_id}/recall/feedback",
        headers=viewer_headers,
        json={"compilation_id": compilation.id, "label": "helpful", "entity_id": memory_id},
    )
    assert feedback_resp.status_code == 201

    auto_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "auto format preference", "limit": 5, "format": "auto"},
    )
    assert auto_resp.status_code == 200
    assert auto_resp.headers["X-ContextCache-Recall-Requested-Format"] == "auto"
    assert auto_resp.headers["X-ContextCache-Recall-Resolved-Format"] == "toonx"
    body = auto_resp.json()
    assert body["renderer"] == "toon-x/v1"
    assert body["mir"]["bundle"]["target_format"] == "toonx"


async def test_admin_recall_feedback_returns_recent_entries(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "decision", "content": "Feedback listing memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "feedback listing", "limit": 5, "format": "toonx"},
    )
    assert recall_resp.status_code == 200

    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "feedback listing",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()

    feedback_resp = await client.post(
        f"/projects/{app_ctx.project_id}/recall/feedback",
        headers=viewer_headers,
        json={"compilation_id": compilation.id, "label": "wrong", "entity_id": memory_id, "note": "bad pick"},
    )
    assert feedback_resp.status_code == 201

    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    response = await client.get(
        "/admin/recall/feedback",
        headers=admin_headers,
        params={"project_id": app_ctx.project_id, "compilation_id": compilation.id, "label": "wrong"},
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows
    assert rows[0]["compilation_id"] == compilation.id
    assert rows[0]["label"] == "wrong"
    assert rows[0]["entity_id"] == memory_id


async def test_admin_query_profile_detail_returns_recent_feedback(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "decision", "content": "Query profile detail memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "query profile detail", "limit": 5, "format": "toonx"},
    )
    assert recall_resp.status_code == 200

    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "query profile detail",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()
    feedback_resp = await client.post(
        f"/projects/{app_ctx.project_id}/recall/feedback",
        headers=viewer_headers,
        json={"compilation_id": compilation.id, "label": "pinned", "entity_id": memory_id, "note": "keep this"},
    )
    assert feedback_resp.status_code == 201
    query_profile_id = feedback_resp.json()["query_profile_id"]
    assert query_profile_id is not None

    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    detail_resp = await client.get(
        f"/admin/recall/query-profiles/{query_profile_id}",
        headers=admin_headers,
    )
    assert detail_resp.status_code == 200
    body = detail_resp.json()
    assert body["id"] == query_profile_id
    assert body["normalized_query"] == "query profile detail"
    assert body["preferred_target_format"] == "toonx"
    assert body["recent_feedback"]
    assert body["recent_feedback"][0]["label"] == "pinned"
    assert body["recent_feedback"][0]["entity_id"] == memory_id


async def test_admin_recall_compilation_detail_includes_recent_feedback(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "decision", "content": "Compilation feedback detail memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "compilation feedback detail", "limit": 5, "format": "toonx"},
    )
    assert recall_resp.status_code == 200
    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "compilation feedback detail",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()
    feedback_resp = await client.post(
        f"/projects/{app_ctx.project_id}/recall/feedback",
        headers=viewer_headers,
        json={"compilation_id": compilation.id, "label": "stale", "entity_id": memory_id, "note": "needs refresh"},
    )
    assert feedback_resp.status_code == 201

    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    detail_resp = await client.get(
        f"/admin/recall/compilations/{compilation.id}",
        headers=admin_headers,
    )
    assert detail_resp.status_code == 200
    body = detail_resp.json()
    assert body["feedback_count"] >= 1
    assert body["recent_feedback"]
    assert body["recent_feedback"][0]["label"] == "stale"
    assert body["recent_feedback"][0]["entity_id"] == memory_id


async def test_admin_recall_feedback_filters_query_profiles_and_eval_metrics(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    viewer_headers = await _login_org_member(client, db_session, app_ctx, role="viewer")
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=auth_headers(app_ctx, role="owner"),
        json={"type": "decision", "content": "Eval metrics memory"},
    )
    assert create_resp.status_code == 201
    memory_id = create_resp.json()["id"]

    recall_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=viewer_headers,
        params={"query": "eval metrics", "limit": 5, "format": "toonx"},
    )
    assert recall_resp.status_code == 200
    compilation = (
        await db_session.execute(
            select(ContextCompilation)
            .where(
                ContextCompilation.project_id == app_ctx.project_id,
                ContextCompilation.query_text == "eval metrics",
            )
            .order_by(ContextCompilation.id.desc())
            .limit(1)
        )
    ).scalar_one()
    feedback_resp = await client.post(
        f"/projects/{app_ctx.project_id}/recall/feedback",
        headers=viewer_headers,
        json={"compilation_id": compilation.id, "label": "helpful", "entity_id": memory_id},
    )
    assert feedback_resp.status_code == 201
    query_profile_id = feedback_resp.json()["query_profile_id"]
    assert query_profile_id is not None

    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    profiles_resp = await client.get(
        "/admin/recall/query-profiles",
        headers=admin_headers,
        params={"project_id": app_ctx.project_id, "preferred_target_format": "toonx", "has_feedback": "true"},
    )
    assert profiles_resp.status_code == 200
    profiles = profiles_resp.json()
    assert any(row["id"] == query_profile_id for row in profiles)

    eval_resp = await client.get(
        "/admin/recall/eval",
        headers=admin_headers,
        params={"lookback_days": 7, "project_id": app_ctx.project_id},
    )
    assert eval_resp.status_code == 200
    body = eval_resp.json()
    assert body["total_feedback"] >= 1
    assert body["query_profile_count"] >= 1
    assert body["feedback_label_counts"]["helpful"] >= 1
    assert body["preferred_format_counts"]["toonx"] >= 1


async def test_admin_ops_summary_reports_capture_backlog_and_failures(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    stale_time = now_utc() - timedelta(hours=2)
    queued = RawCapture(
        org_id=app_ctx.org_id,
        project_id=app_ctx.project_id,
        source="cli",
        payload={"text": "queued"},
        processing_status="queued",
        captured_at=stale_time,
    )
    failed = RawCapture(
        org_id=app_ctx.org_id,
        project_id=app_ctx.project_id,
        source="cli",
        payload={"text": "failed"},
        processing_status="failed",
        attempt_count=2,
        last_error="boom",
        last_error_at=stale_time,
    )
    dead = RawCapture(
        org_id=app_ctx.org_id,
        project_id=app_ctx.project_id,
        source="cli",
        payload={"text": "dead"},
        processing_status="dead_letter",
        attempt_count=3,
        last_error="still broken",
        last_error_at=stale_time,
        dead_lettered_at=stale_time,
    )
    db_session.add_all([queued, failed, dead])
    await db_session.commit()

    response = await client.get(
        "/admin/ops/summary",
        headers=admin_headers,
        params={"stale_minutes": 60, "recent_limit": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["queued_count"] >= 1
    assert body["failed_count"] >= 1
    assert body["dead_letter_count"] >= 1
    assert body["stale_capture_count"] >= 2
    assert any(row["id"] == dead.id for row in body["recent_capture_failures"])


async def test_admin_recall_eval_aggregates_recent_quality_metrics(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    create_resp = await client.post(
        f"/projects/{app_ctx.project_id}/memories",
        headers=admin_headers,
        json={"type": "decision", "content": "Recall evaluation target memory"},
    )
    assert create_resp.status_code == 201

    query_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=admin_headers,
        params={"query": "evaluation target", "limit": 5},
    )
    assert query_resp.status_code == 200
    empty_resp = await client.get(
        f"/projects/{app_ctx.project_id}/recall",
        headers=admin_headers,
        params={"query": "", "limit": 5},
    )
    assert empty_resp.status_code == 200

    response = await client.get(
        "/admin/recall/eval",
        headers=admin_headers,
        params={"lookback_days": 7, "project_id": app_ctx.project_id},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_queries"] >= 2
    assert body["empty_query_count"] >= 1
    assert body["avg_total_duration_ms"] is not None
    assert body["max_total_duration_ms"] is not None
    assert body["served_by_counts"]
    assert body["strategy_counts"]


async def test_integration_signature_rejects_stale_timestamp_when_legacy_disabled(
    client,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    monkeypatch.setenv("INTEGRATION_SIGNING_SECRET", "super-secret")
    monkeypatch.setenv("INTEGRATION_ALLOW_LEGACY_SIGNATURE", "false")
    payload = {
        "project_id": app_ctx.project_id,
        "type": "note",
        "source": "api",
        "content": "signed integration capture",
        "metadata": {},
        "tags": [],
    }
    body = json.dumps(payload).encode("utf-8")
    stale_timestamp = str(int((now_utc() - timedelta(minutes=10)).timestamp()))
    digest = hmac.new(
        b"super-secret",
        stale_timestamp.encode("utf-8") + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    headers = auth_headers(app_ctx, role="owner")
    headers["Content-Type"] = "application/json"
    headers["X-Integration-Timestamp"] = stale_timestamp
    headers["X-Integration-Signature"] = f"sha256={digest}"

    response = await client.post("/integrations/memories", headers=headers, content=body)
    assert response.status_code == 401
    assert "stale" in response.json()["detail"].lower()


async def test_admin_security_posture_reports_strict_timestamp_mode(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    monkeypatch.setenv("INTEGRATION_SIGNING_SECRET", "super-secret")
    monkeypatch.setenv("INTEGRATION_ALLOW_LEGACY_SIGNATURE", "false")
    monkeypatch.setenv("INTEGRATION_SIGNATURE_MAX_AGE_SECONDS", "120")
    admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )

    response = await client.get("/admin/security/posture", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["integration_signing_secret_configured"] is True
    assert body["integration_signature_mode"] == "strict_timestamp"
    assert body["integration_signature_max_age_seconds"] == 120


async def test_admin_api_keys_requires_global_admin_session(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    owner_headers = await _login_org_member(client, db_session, app_ctx, role="owner")
    forbidden = await client.get("/admin/api-keys", headers=owner_headers)
    assert forbidden.status_code == 403

    global_admin_headers = await _login_org_member(
        client,
        db_session,
        app_ctx,
        role="owner",
        is_admin=True,
    )
    response = await client.get("/admin/api-keys", headers=global_admin_headers)
    assert response.status_code == 200
    assert any(row["org_id"] == app_ctx.org_id for row in response.json())


async def test_vector_query_orders_by_raw_distance_operator() -> None:
    stmt = build_vector_candidate_stmt(
        project_id=7,
        query_vector=[0.0, 0.1, 0.2],
        vector_candidates=25,
    )
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "ORDER BY" in compiled
    assert "memories.embedding_vector <=>" in compiled
    assert "DESC" not in compiled


async def test_vector_query_uses_hilbert_prefilter_when_enabled() -> None:
    stmt = build_vector_candidate_stmt(
        project_id=7,
        query_vector=[0.0, 0.1, 0.2],
        vector_candidates=25,
        use_hilbert=True,
        hilbert_window=2048,
    )
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "memories.hilbert_index" in compiled
    assert "ORDER BY" in compiled
    assert "memories.embedding_vector <=>" in compiled


async def test_x_user_email_header_ignored_outside_dev(client, app_ctx: Ctx) -> None:
    owner_me = await client.get("/me", headers=auth_headers(app_ctx, role="owner"))
    viewer_me = await client.get("/me", headers=auth_headers(app_ctx, role="viewer"))
    assert owner_me.status_code == 200
    assert viewer_me.status_code == 200
    # APP_ENV=test should ignore X-User-Email to prevent header-based privilege escalation.
    assert owner_me.json()["actor_user_id"] == viewer_me.json()["actor_user_id"]


async def test_ingestion_hash_ignores_mtime_for_embedding_reuse(
    db_session: AsyncSession,
    app_ctx: Ctx,
    tmp_path,
    monkeypatch,
) -> None:
    source_dir = tmp_path / "ingest"
    source_dir.mkdir(parents=True, exist_ok=True)
    source_file = source_dir / "notes.md"
    source_file.write_text(
        "ContextCache ingestion baseline.\n\nThis content should not be re-embedded on mtime-only changes.",
        encoding="utf-8",
    )

    calls = {"count": 0}

    def fake_embedding(_text: str, *args, **kwargs) -> list[float]:
        calls["count"] += 1
        return [0.0] * 1536

    monkeypatch.setattr("app.ingestion.pipeline.compute_embedding", fake_embedding)

    first = await ingest_path_incremental(
        db_session,
        project_id=app_ctx.project_id,
        created_by_user_id=None,
        config=IngestionConfig(source_root=str(source_dir)),
    )
    await db_session.commit()
    assert first["inserted"] >= 1
    first_calls = calls["count"]
    assert first_calls >= 1

    # mtime change only (content unchanged): should avoid new embedding calls.
    source_file.touch()
    second = await ingest_path_incremental(
        db_session,
        project_id=app_ctx.project_id,
        created_by_user_id=None,
        config=IngestionConfig(source_root=str(source_dir)),
    )
    await db_session.commit()
    assert second["inserted"] == 0
    assert calls["count"] == first_calls
    assert second["updated"] >= 1

    # No mtime change: whole file should be skipped.
    third = await ingest_path_incremental(
        db_session,
        project_id=app_ctx.project_id,
        created_by_user_id=None,
        config=IngestionConfig(source_root=str(source_dir)),
    )
    assert third["inserted"] == 0
    assert third["updated"] == 0
    assert third["skipped"] >= 1
