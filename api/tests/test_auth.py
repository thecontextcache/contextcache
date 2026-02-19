from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_utils import hash_token, now_utc
from app.models import AuthInvite, AuthMagicLink, AuthSession, AuthUser

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


async def test_admin_requires_auth(client) -> None:
    response = await client.get("/admin/users")
    assert response.status_code == 401


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
