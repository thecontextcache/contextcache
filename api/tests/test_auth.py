from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import external_auth as external_auth_module
from app import rate_limit as rate_limit_module
from app import routes as routes_module
from app.auth_routes import _resolve_admin_audit_org_id
from app.auth_utils import hash_token, now_utc
from app.models import AuditLog, AuthInvite, AuthMagicLink, AuthSession, AuthUser, Membership, Organization, UsageCounter, User, Waitlist
from .conftest import Ctx, auth_headers, login_via_magic_link, session_auth_headers

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def patch_email_sender(monkeypatch):
    monkeypatch.setattr("app.auth_routes.send_magic_link", lambda email, link, template_type="login": (True, "logged"))
    monkeypatch.setattr("app.auth_routes.send_invite_email", lambda email: (True, "logged"))
    monkeypatch.setattr("app.auth_routes.send_waitlist_rejection_email", lambda email: (True, "logged"))


async def _login_session(
    client,
    db_session: AsyncSession,
    *,
    email: str,
    is_admin: bool = False,
    org_id: int | None = None,
) -> dict[str, str]:
    await client.post("/auth/logout")
    verify = await login_via_magic_link(client, db_session, email=email, is_admin=is_admin)
    assert verify.status_code == 200
    return session_auth_headers(org_id=org_id)


async def test_request_link_forbidden_when_not_invited(client, db_session: AsyncSession) -> None:
    db_session.add(AuthUser(email="seeded-auth@example.com", is_admin=False))
    await db_session.commit()
    response = await client.post("/auth/request-link", json={"email": "new-user@example.com"})
    assert response.status_code == 403


async def test_request_link_forbidden_when_invite_revoked(client, db_session: AsyncSession) -> None:
    db_session.add(
        AuthInvite(
            email="revoked@example.com",
            invited_by_user_id=None,
            expires_at=now_utc() + timedelta(days=7),
            revoked_at=now_utc(),
        )
    )
    await db_session.commit()

    response = await client.post("/auth/request-link", json={"email": "revoked@example.com"})
    assert response.status_code == 403


async def test_request_link_allowed_when_invited(client, db_session: AsyncSession) -> None:
    db_session.add(
        AuthInvite(
            email="invited@example.com",
            invited_by_user_id=None,
            expires_at=now_utc() + timedelta(days=7),
        )
    )
    await db_session.commit()

    response = await client.post("/auth/request-link", json={"email": "invited@example.com"})
    assert response.status_code == 200

    link = (
        await db_session.execute(select(AuthMagicLink).where(AuthMagicLink.email == "invited@example.com").limit(1))
    ).scalar_one_or_none()
    assert link is not None


async def test_request_link_existing_user_shows_registered_message(client, db_session: AsyncSession) -> None:
    db_session.add(AuthUser(email="existing@example.com", is_admin=False))
    await db_session.commit()

    response = await client.post("/auth/request-link", json={"email": "existing@example.com"})
    assert response.status_code == 200
    body = response.json()
    assert "already registered" in body["detail"].lower()


async def test_waitlist_duplicate_returns_409(client, db_session: AsyncSession) -> None:
    db_session.add(Waitlist(email="dup-waitlist@example.com"))
    await db_session.commit()

    response = await client.post("/waitlist", json={"email": "dup-waitlist@example.com"})
    assert response.status_code == 409


async def test_verify_consumes_token_and_creates_session(client, db_session: AsyncSession) -> None:
    raw = "tok1234567890"
    db_session.add(
        AuthMagicLink(
            email="joiner@example.com",
            token_hash=hash_token(raw),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()

    response = await client.get(f"/auth/verify?token={raw}")
    assert response.status_code == 200
    assert "contextcache_session" in response.cookies

    magic = (
        await db_session.execute(select(AuthMagicLink).where(AuthMagicLink.token_hash == hash_token(raw)).limit(1))
    ).scalar_one()
    assert magic.consumed_at is not None


async def test_reuse_token_fails(client, db_session: AsyncSession) -> None:
    raw = "tok_reuse_123"
    db_session.add(
        AuthMagicLink(
            email="reuse@example.com",
            token_hash=hash_token(raw),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()

    first = await client.get(f"/auth/verify?token={raw}")
    assert first.status_code == 200
    second = await client.get(f"/auth/verify?token={raw}")
    assert second.status_code == 400


async def test_external_bearer_auth_projects_local_identity(client, db_session: AsyncSession, monkeypatch) -> None:
    monkeypatch.setenv("EXTERNAL_AUTH_ENABLED", "true")

    async def _fake_verify(token: str) -> external_auth_module.ExternalAuthIdentity:
        assert token == "ext-valid"
        return external_auth_module.ExternalAuthIdentity(
            email="external-user@example.com",
            display_name="External User",
        )

    monkeypatch.setattr("app.main.external_auth.verify_bearer_token", _fake_verify)

    response = await client.get("/me", headers={"Authorization": "Bearer ext-valid"})
    assert response.status_code == 200
    body = response.json()
    assert body["actor_user_id"] is not None
    assert body["org_id"] is None
    assert body["role"] is None

    auth_user = (
        await db_session.execute(
            select(AuthUser).where(AuthUser.email == "external-user@example.com").limit(1)
        )
    ).scalar_one_or_none()
    assert auth_user is not None

    domain_user = (
        await db_session.execute(
            select(User).where(User.email == "external-user@example.com").limit(1)
        )
    ).scalar_one_or_none()
    assert domain_user is not None
    assert domain_user.auth_user_id == auth_user.id


async def test_external_bearer_auth_can_create_org(client, db_session: AsyncSession, monkeypatch) -> None:
    monkeypatch.setenv("EXTERNAL_AUTH_ENABLED", "true")

    async def _fake_verify(_: str) -> external_auth_module.ExternalAuthIdentity:
        return external_auth_module.ExternalAuthIdentity(
            email="org-creator@example.com",
            display_name="Org Creator",
        )

    monkeypatch.setattr("app.main.external_auth.verify_bearer_token", _fake_verify)

    response = await client.post(
        "/orgs",
        headers={"Authorization": "Bearer ext-org"},
        json={"name": "External Auth Org"},
    )
    assert response.status_code == 201

    domain_user = (
        await db_session.execute(select(User).where(User.email == "org-creator@example.com").limit(1))
    ).scalar_one()
    membership = (
        await db_session.execute(
            select(Membership).where(
                Membership.org_id == response.json()["id"],
                Membership.user_id == domain_user.id,
            ).limit(1)
        )
    ).scalar_one_or_none()
    assert membership is not None
    assert membership.role == "owner"


async def test_external_bearer_auth_rejects_inactive_token(client, monkeypatch) -> None:
    monkeypatch.setenv("EXTERNAL_AUTH_ENABLED", "true")

    async def _fake_verify(_: str) -> external_auth_module.ExternalAuthIdentity:
        raise external_auth_module.ExternalAuthInvalidToken("inactive")

    monkeypatch.setattr("app.main.external_auth.verify_bearer_token", _fake_verify)

    response = await client.get("/me", headers={"Authorization": "Bearer ext-dead"})
    assert response.status_code == 401


async def test_rate_limit_triggers(client, db_session: AsyncSession) -> None:
    db_session.add(
        AuthInvite(
            email="ratelimit@example.com",
            invited_by_user_id=None,
            expires_at=now_utc() + timedelta(days=7),
        )
    )
    await db_session.commit()

    statuses = []
    for _ in range(4):
        response = await client.post("/auth/request-link", json={"email": "ratelimit@example.com"})
        statuses.append(response.status_code)

    assert statuses[-1] == 429


async def test_request_link_limits_allow_zero_to_disable(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit_module, "APP_ENV", "test")
    monkeypatch.setattr(rate_limit_module, "_REDIS_CLIENT", None)
    monkeypatch.setattr(rate_limit_module, "AUTH_RATE_LIMIT_PER_IP_PER_HOUR", 0)
    monkeypatch.setattr(rate_limit_module, "AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR", 0)
    rate_limit_module._REQUESTS.clear()

    for _ in range(6):
        allowed, detail = rate_limit_module.check_request_link_limits("127.0.0.1", "zero-limit@example.com")
        assert allowed is True
        assert detail is None


async def test_verify_limits_allow_zero_to_disable(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit_module, "APP_ENV", "test")
    monkeypatch.setattr(rate_limit_module, "_REDIS_CLIENT", None)
    monkeypatch.setattr(rate_limit_module, "AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR", 0)
    rate_limit_module._REQUESTS.clear()

    for _ in range(6):
        allowed, detail = rate_limit_module.check_verify_limits("127.0.0.1")
        assert allowed is True
        assert detail is None


async def test_recall_limits_allow_zero_to_disable(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit_module, "APP_ENV", "test")
    monkeypatch.setattr(rate_limit_module, "_REDIS_CLIENT", None)
    monkeypatch.setattr(rate_limit_module, "RECALL_RATE_LIMIT_PER_IP_PER_HOUR", 0)
    monkeypatch.setattr(rate_limit_module, "RECALL_RATE_LIMIT_PER_ACCOUNT_PER_HOUR", 0)
    rate_limit_module._REQUESTS.clear()

    for _ in range(6):
        allowed, detail = rate_limit_module.check_recall_limits("127.0.0.1", "acct-zero")
        assert allowed is True
        assert detail is None


async def test_write_limits_return_503_when_backend_missing_in_prod(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit_module, "APP_ENV", "prod")
    monkeypatch.setattr(rate_limit_module, "_REDIS_CLIENT", None)
    monkeypatch.setattr(rate_limit_module, "_get_redis_client", lambda: None)
    monkeypatch.setattr(rate_limit_module, "WRITE_RATE_LIMIT_PER_IP_PER_MINUTE", 1)
    monkeypatch.setattr(rate_limit_module, "WRITE_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE", 1)

    allowed, detail = rate_limit_module.check_write_limits("127.0.0.1", "acct-1")
    assert allowed is False
    assert detail == "Service unavailable. Rate limiter backend is unavailable."


async def test_write_limit_in_memory_fallback_uses_minute_window(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit_module, "APP_ENV", "test")
    monkeypatch.setattr(rate_limit_module, "_REDIS_CLIENT", None)
    monkeypatch.setattr(rate_limit_module, "_get_redis_client", lambda: None)
    monkeypatch.setattr(rate_limit_module, "WRITE_RATE_LIMIT_PER_IP_PER_MINUTE", 1)
    monkeypatch.setattr(rate_limit_module, "WRITE_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE", 0)
    rate_limit_module._REQUESTS.clear()

    allowed, detail = rate_limit_module.check_write_limits("127.0.0.1", "")
    assert allowed is True
    assert detail is None

    rate_limit_module._REQUESTS["write:ip:127.0.0.1"][0] = datetime.now(timezone.utc) - timedelta(seconds=61)

    allowed, detail = rate_limit_module.check_write_limits("127.0.0.1", "")
    assert allowed is True
    assert detail is None


async def test_weekly_limit_still_enforced_when_daily_limit_disabled(
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    auth_user = AuthUser(email="weekly-only@example.com", is_admin=False)
    db_session.add(auth_user)
    await db_session.flush()

    db_session.add(
        UsageCounter(
            user_id=auth_user.id,
            day=now_utc().date(),
            memories_created=5,
            recall_queries=0,
            projects_created=0,
        )
    )
    await db_session.commit()

    monkeypatch.setattr(routes_module, "DAILY_MEMORY_LIMIT", 0)
    monkeypatch.setattr(routes_module, "WEEKLY_MEMORY_LIMIT", 5)

    with pytest.raises(HTTPException) as excinfo:
        await routes_module._check_daily_limit(
            db_session,
            auth_user.id,
            "memories_created",
            routes_module.DAILY_MEMORY_LIMIT,
        )

    assert excinfo.value.status_code == 429
    assert "Weekly limit reached" in str(excinfo.value.detail)


async def test_admin_invite_endpoints_require_admin(client, db_session: AsyncSession) -> None:
    admin_headers = await _login_session(
        client,
        db_session,
        email="admin@example.com",
        is_admin=True,
    )

    create = await client.post("/admin/invites", headers=admin_headers, json={"email": "another@example.com"})
    assert create.status_code == 201
    duplicate = await client.post("/admin/invites", headers=admin_headers, json={"email": "another@example.com"})
    assert duplicate.status_code == 409

    member_headers = await _login_session(client, db_session, email="member@example.com")
    blocked = await client.post("/admin/invites", headers=member_headers, json={"email": "nope@example.com"})
    assert blocked.status_code == 403


async def test_admin_waitlist_supports_pagination_and_filters(client, db_session: AsyncSession) -> None:
    admin_headers = await _login_session(
        client,
        db_session,
        email="waitlist-admin@example.com",
        is_admin=True,
    )

    db_session.add_all(
        [
            Waitlist(email="alpha1@example.com", status="pending"),
            Waitlist(email="alpha2@example.com", status="approved"),
            Waitlist(email="beta1@example.com", status="pending"),
        ]
    )
    await db_session.commit()

    filtered = await client.get(
        "/admin/waitlist?status=pending&email_q=alpha&limit=5&offset=0",
        headers=admin_headers,
    )
    assert filtered.status_code == 200
    rows = filtered.json()
    assert len(rows) == 1
    assert rows[0]["email"] == "alpha1@example.com"


async def test_admin_waitlist_requires_global_admin_session(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    forbidden = await client.get("/admin/waitlist", headers=auth_headers(app_ctx))
    assert forbidden.status_code == 403

    admin_headers = await _login_session(
        client,
        db_session,
        email=app_ctx.users["owner"],
        is_admin=True,
        org_id=app_ctx.org_id,
    )
    response = await client.get("/admin/waitlist", headers=admin_headers)
    assert response.status_code == 200


async def test_admin_requires_auth(client, app_ctx: Ctx) -> None:
    response = await client.get("/admin/users")
    assert response.status_code == 401


async def test_admin_cag_stats_requires_admin(client, db_session: AsyncSession, app_ctx: Ctx) -> None:
    unauth = await client.get("/admin/cag/cache-stats")
    assert unauth.status_code == 401

    plain_headers = await _login_session(client, db_session, email="plain-user@example.com")
    forbidden = await client.get("/admin/cag/cache-stats", headers=plain_headers)
    assert forbidden.status_code == 403


async def test_admin_cag_evaporate_writes_audit_without_org_header(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_session(
        client,
        db_session,
        email=app_ctx.users["owner"],
        is_admin=True,
    )

    response = await client.post("/admin/cag/evaporate", headers=admin_headers)
    assert response.status_code == 200

    audit_row = (
        await db_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "admin.cag.evaporate")
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert audit_row.org_id == app_ctx.org_id
    assert audit_row.entity_type == "cag_cache"
    assert audit_row.entity_id == 0


async def test_admin_disable_orphan_auth_user_audits_to_actor_org(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_session(
        client,
        db_session,
        email=app_ctx.users["owner"],
        is_admin=True,
    )

    orphan = AuthUser(email="orphan-admin-target@example.com", is_admin=False)
    db_session.add(orphan)
    await db_session.commit()

    response = await client.post(f"/admin/users/{orphan.id}/disable", headers=admin_headers)
    assert response.status_code == 200

    audit_row = (
        await db_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "admin.user.disable")
            .where(AuditLog.entity_id == orphan.id)
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert audit_row.org_id == app_ctx.org_id
    assert audit_row.metadata_json["target_auth_user_id"] == orphan.id
    assert audit_row.metadata_json["audit_org_resolution"] == "request"


async def test_admin_disable_member_of_other_org_audits_to_target_org(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    admin_headers = await _login_session(
        client,
        db_session,
        email=app_ctx.users["owner"],
        is_admin=True,
    )

    other_org = Organization(name="Target Audit Org")
    db_session.add(other_org)
    await db_session.flush()

    target_auth = AuthUser(email="cross-org-target@example.com", is_admin=False)
    db_session.add(target_auth)
    await db_session.flush()

    target_user = User(
        email="cross-org-target@example.com",
        display_name="Cross Org Target",
        auth_user_id=target_auth.id,
    )
    db_session.add(target_user)
    await db_session.flush()
    db_session.add(Membership(org_id=other_org.id, user_id=target_user.id, role="member"))
    await db_session.commit()

    response = await client.post(f"/admin/users/{target_auth.id}/disable", headers=admin_headers)
    assert response.status_code == 200

    audit_row = (
        await db_session.execute(
            select(AuditLog)
            .where(AuditLog.action == "admin.user.disable")
            .where(AuditLog.entity_id == target_auth.id)
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
    ).scalar_one()
    assert audit_row.org_id == other_org.id
    assert audit_row.metadata_json["audit_org_resolution"] == "target_membership"
    assert audit_row.metadata_json["target_auth_user_id"] == target_auth.id


async def test_admin_audit_org_resolution_falls_back_to_actor_for_orphan_target(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
) -> None:
    await _login_session(
        client,
        db_session,
        email=app_ctx.users["owner"],
        is_admin=True,
    )
    actor_auth = (
        await db_session.execute(
            select(AuthUser).where(AuthUser.email == app_ctx.users["owner"]).limit(1)
        )
    ).scalar_one()

    orphan = AuthUser(email="orphan-admin-resolution@example.com", is_admin=False)
    db_session.add(orphan)
    await db_session.commit()

    request = SimpleNamespace(state=SimpleNamespace(auth_user_id=actor_auth.id))
    org_id, resolution = await _resolve_admin_audit_org_id(
        db_session,
        request,
        target_auth_user_id=orphan.id,
    )

    assert org_id == app_ctx.org_id
    assert resolution == "actor_fallback"


async def test_disabled_user_cannot_login(client, db_session: AsyncSession) -> None:
    db_session.add(
        AuthUser(
            email="disabled@example.com",
            is_admin=False,
            is_disabled=True,
        )
    )
    db_session.add(
        AuthMagicLink(
            email="disabled@example.com",
            token_hash=hash_token("tok_disabled_123"),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()

    response = await client.get("/auth/verify?token=tok_disabled_123")
    assert response.status_code == 403


async def test_session_cap_enforced(client, db_session: AsyncSession) -> None:
    email = "sessioncap@example.com"
    tokens = [
        "tok_cap_session_0001",
        "tok_cap_session_0002",
        "tok_cap_session_0003",
        "tok_cap_session_0004",
    ]
    for token in tokens:
        db_session.add(
            AuthMagicLink(
                email=email,
                token_hash=hash_token(token),
                expires_at=now_utc() + timedelta(minutes=10),
                purpose="login",
                send_status="logged",
            )
        )
    await db_session.commit()

    for token in tokens:
        resp = await client.get(f"/auth/verify?token={token}")
        assert resp.status_code == 200

    user = (await db_session.execute(select(AuthUser).where(AuthUser.email == email).limit(1))).scalar_one()
    active_sessions = (
        await db_session.execute(
            select(AuthSession).where(
                AuthSession.user_id == user.id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now_utc(),
            )
        )
    ).scalars().all()
    assert len(active_sessions) == 3


async def test_admin_flows_write_audit_logs(
    client,
    db_session: AsyncSession,
    app_ctx: Ctx,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.auth_routes.send_invite_email", lambda email: (True, "logged"))
    monkeypatch.setattr("app.auth_routes.send_waitlist_rejection_email", lambda email: (True, "logged"))

    admin_email = app_ctx.users["owner"]
    admin_auth = AuthUser(email=admin_email, is_admin=True)
    target_auth = AuthUser(email="audited-target@example.com", is_admin=False)
    db_session.add_all([admin_auth, target_auth, Waitlist(email="audited-waitlist@example.com", status="pending")])
    await db_session.flush()

    target_session = AuthSession(
        user_id=target_auth.id,
        session_token_hash=hash_token("tok_target_active_session"),
        expires_at=now_utc() + timedelta(days=7),
    )
    db_session.add(target_session)
    await db_session.commit()

    admin_headers = await _login_session(
        client,
        db_session,
        email=admin_email,
        is_admin=True,
        org_id=app_ctx.org_id,
    )

    create_invite = await client.post(
        "/admin/invites",
        headers=admin_headers,
        json={"email": "audited-invite@example.com", "notes": "security regression"},
    )
    assert create_invite.status_code == 201
    invite_id = create_invite.json()["id"]

    revoke_invite = await client.post(f"/admin/invites/{invite_id}/revoke", headers=admin_headers)
    assert revoke_invite.status_code == 200

    disable = await client.post(f"/admin/users/{target_auth.id}/disable", headers=admin_headers)
    assert disable.status_code == 200

    enable = await client.post(f"/admin/users/{target_auth.id}/enable", headers=admin_headers)
    assert enable.status_code == 200

    grant_admin = await client.post(f"/admin/users/{target_auth.id}/grant-admin", headers=admin_headers)
    assert grant_admin.status_code == 200

    revoke_admin = await client.post(f"/admin/users/{target_auth.id}/revoke-admin", headers=admin_headers)
    assert revoke_admin.status_code == 200

    fresh_target_session = AuthSession(
        user_id=target_auth.id,
        session_token_hash=hash_token("tok_target_post_enable_session"),
        expires_at=now_utc() + timedelta(days=7),
    )
    db_session.add(fresh_target_session)
    await db_session.commit()

    revoke_sessions = await client.post(f"/admin/users/{target_auth.id}/revoke-sessions", headers=admin_headers)
    assert revoke_sessions.status_code == 200
    assert revoke_sessions.json()["revoked"] == 1

    set_unlimited = await client.post(
        f"/admin/users/{target_auth.id}/set-unlimited?unlimited=true",
        headers=admin_headers,
    )
    assert set_unlimited.status_code == 200

    set_plan = await client.post(
        f"/admin/users/{target_auth.id}/set-plan?plan_code=free",
        headers=admin_headers,
    )
    assert set_plan.status_code == 200

    set_org_plan = await client.post(
        f"/admin/orgs/{app_ctx.org_id}/set-plan?plan_code=free",
        headers=admin_headers,
    )
    assert set_org_plan.status_code == 200

    evaporate = await client.post("/admin/cag/evaporate", headers=admin_headers)
    assert evaporate.status_code == 200

    approve_waitlist = await client.post("/admin/waitlist/1/approve", headers=admin_headers)
    assert approve_waitlist.status_code == 201

    reject_seed = Waitlist(email="audited-reject@example.com", status="pending")
    db_session.add(reject_seed)
    await db_session.commit()

    reject_waitlist = await client.post(f"/admin/waitlist/{reject_seed.id}/reject", headers=admin_headers)
    assert reject_waitlist.status_code == 200

    actions = (
        await db_session.execute(
            select(AuditLog.action)
            .where(AuditLog.org_id == app_ctx.org_id)
            .order_by(AuditLog.id.asc())
        )
    ).scalars().all()

    assert "admin.invite.create" in actions
    assert "admin.invite.revoke" in actions
    assert "admin.user.disable" in actions
    assert "admin.user.enable" in actions
    assert "admin.user.grant_admin" in actions
    assert "admin.user.revoke_admin" in actions
    assert "admin.user.revoke_sessions" in actions
    assert "admin.user.set_unlimited" in actions
    assert "admin.user.set_plan" in actions
    assert "admin.org.set_plan" in actions
    assert "admin.cag.evaporate" in actions
    assert "admin.waitlist.approve" in actions
    assert "admin.waitlist.reject" in actions
