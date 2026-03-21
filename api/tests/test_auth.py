from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import external_auth as external_auth_module
from app.auth_utils import hash_token, now_utc
from app.models import AuthInvite, AuthMagicLink, AuthSession, AuthUser, Membership, User, Waitlist
from .conftest import Ctx, auth_headers

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def patch_email_sender(monkeypatch):
    monkeypatch.setattr("app.auth_routes.send_magic_link", lambda email, link, template_type="login": (True, "logged"))


async def test_request_link_forbidden_when_not_invited(client) -> None:
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


async def test_admin_invite_endpoints_require_admin(client, db_session: AsyncSession) -> None:
    raw = "tok_admin_123"
    db_session.add(
        AuthMagicLink(
            email="admin@example.com",
            token_hash=hash_token(raw),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()

    verify = await client.get(f"/auth/verify?token={raw}")
    assert verify.status_code == 200

    create = await client.post("/admin/invites", json={"email": "another@example.com"})
    assert create.status_code == 201
    duplicate = await client.post("/admin/invites", json={"email": "another@example.com"})
    assert duplicate.status_code == 409

    non_admin = AuthUser(email="member@example.com", is_admin=False)
    db_session.add(non_admin)
    db_session.add(
        AuthMagicLink(
            email="member@example.com",
            token_hash=hash_token("tok_member_123"),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()

    await client.post("/auth/logout")
    verify_member = await client.get("/auth/verify?token=tok_member_123")
    assert verify_member.status_code == 200

    blocked = await client.post("/admin/invites", json={"email": "nope@example.com"})
    assert blocked.status_code == 403


async def test_admin_waitlist_supports_pagination_and_filters(client, db_session: AsyncSession) -> None:
    raw = "tok_waitlist_admin_123"
    db_session.add(
        AuthMagicLink(
            email="waitlist-admin@example.com",
            token_hash=hash_token(raw),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()
    verify = await client.get(f"/auth/verify?token={raw}")
    assert verify.status_code == 200

    db_session.add_all(
        [
            Waitlist(email="alpha1@example.com", status="pending"),
            Waitlist(email="alpha2@example.com", status="approved"),
            Waitlist(email="beta1@example.com", status="pending"),
        ]
    )
    await db_session.commit()

    filtered = await client.get("/admin/waitlist?status=pending&email_q=alpha&limit=5&offset=0")
    assert filtered.status_code == 200
    rows = filtered.json()
    assert len(rows) == 1
    assert rows[0]["email"] == "alpha1@example.com"


async def test_admin_waitlist_allows_admin_api_key(client, app_ctx: Ctx) -> None:
    response = await client.get("/admin/waitlist", headers=auth_headers(app_ctx))
    assert response.status_code == 200


async def test_admin_requires_auth(client) -> None:
    response = await client.get("/admin/users")
    assert response.status_code == 401


async def test_admin_cag_stats_requires_admin(client, db_session: AsyncSession) -> None:
    unauth = await client.get("/admin/cag/cache-stats")
    assert unauth.status_code == 401

    db_session.add(AuthUser(email="plain-user@example.com", is_admin=False))
    db_session.add(
        AuthMagicLink(
            email="plain-user@example.com",
            token_hash=hash_token("tok_plain_user"),
            expires_at=now_utc() + timedelta(minutes=10),
            purpose="login",
            send_status="logged",
        )
    )
    await db_session.commit()

    verified = await client.get("/auth/verify?token=tok_plain_user")
    assert verified.status_code == 200
    forbidden = await client.get("/admin/cag/cache-stats")
    assert forbidden.status_code == 403


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
    tokens = ["tok_cap_1", "tok_cap_2", "tok_cap_3", "tok_cap_4"]
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
