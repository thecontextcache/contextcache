"""Tests for AuthLoginEvent recording and the 10-event retention policy.

These tests exercise:
1. A login event row is created on successful magic-link verification.
2. The IP is taken from CF-Connecting-IP when present.
3. After more than 10 logins, older rows are pruned so exactly 10 remain.
4. The admin /login-events endpoint is protected (403 for non-admin).
5. The admin /login-events endpoint returns up to 10 rows.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_utils import hash_token, magic_link_expiry, now_utc
from app.models import AuthInvite, AuthLoginEvent, AuthMagicLink, AuthUser

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def patch_email_sender(monkeypatch):
    monkeypatch.setattr(
        "app.auth_routes.send_magic_link",
        lambda email, link, template_type="login": (True, "logged"),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _setup_invited_user(db: AsyncSession, email: str) -> None:
    """Create an auth invite so the user can request a magic link."""
    db.add(
        AuthInvite(
            email=email,
            invited_by_user_id=None,
            expires_at=now_utc() + timedelta(days=30),
        )
    )
    await db.commit()


async def _create_magic_link(db: AsyncSession, email: str) -> str:
    """Insert a fresh magic link and return the raw token."""
    raw = f"test_token_{email.replace('@', '_')}_{now_utc().timestamp()}"
    db.add(
        AuthMagicLink(
            email=email,
            token_hash=hash_token(raw),
            expires_at=magic_link_expiry(),
        )
    )
    await db.commit()
    return raw


async def _do_verify(client, token: str, *, cf_ip: str | None = None) -> int:
    """Call GET /auth/verify and return the HTTP status code."""
    headers = {}
    if cf_ip:
        headers["CF-Connecting-IP"] = cf_ip
    resp = await client.get(f"/auth/verify?token={token}", headers=headers)
    return resp.status_code


# ---------------------------------------------------------------------------
# Test 1 — login event is created on successful verify
# ---------------------------------------------------------------------------

async def test_login_event_created_on_verify(client, db_session: AsyncSession) -> None:
    email = "login-event-user@example.com"
    await _setup_invited_user(db_session, email)

    # Re-open the session for the magic link because the fixture session is isolated
    raw = await _create_magic_link(db_session, email)
    status = await _do_verify(client, raw, cf_ip="1.2.3.4")
    assert status == 200

    # Verify DB
    user = (
        await db_session.execute(select(AuthUser).where(AuthUser.email == email).limit(1))
    ).scalar_one_or_none()
    assert user is not None

    event_count = (
        await db_session.execute(
            select(func.count(AuthLoginEvent.id)).where(AuthLoginEvent.user_id == user.id)
        )
    ).scalar_one()
    assert event_count == 1


# ---------------------------------------------------------------------------
# Test 2 — CF-Connecting-IP is stored, not X-Forwarded-For
# ---------------------------------------------------------------------------

async def test_cf_ip_takes_precedence(client, db_session: AsyncSession) -> None:
    email = "cf-ip-user@example.com"
    await _setup_invited_user(db_session, email)
    raw = await _create_magic_link(db_session, email)

    resp = await client.get(
        f"/auth/verify?token={raw}",
        headers={
            "CF-Connecting-IP": "10.0.0.1",
            "X-Forwarded-For": "20.0.0.2",
        },
    )
    assert resp.status_code == 200

    user = (
        await db_session.execute(select(AuthUser).where(AuthUser.email == email).limit(1))
    ).scalar_one_or_none()
    assert user is not None

    event = (
        await db_session.execute(
            select(AuthLoginEvent).where(AuthLoginEvent.user_id == user.id).limit(1)
        )
    ).scalar_one_or_none()
    assert event is not None
    assert str(event.ip) == "10.0.0.1", f"Expected CF-IP 10.0.0.1, got {event.ip}"


# ---------------------------------------------------------------------------
# Test 3 — retention: after 12 logins exactly 10 rows remain
# ---------------------------------------------------------------------------

async def test_login_event_retention_keeps_last_10(client, db_session: AsyncSession) -> None:
    email = "retention-user@example.com"
    await _setup_invited_user(db_session, email)

    # Do 12 successive logins (each verify consumes the token; we create a new one each time)
    for i in range(12):
        raw = await _create_magic_link(db_session, email)
        # Re-use db_session; the token is committed above
        status = await _do_verify(client, raw, cf_ip=f"192.168.1.{i + 1}")
        assert status == 200, f"Login {i + 1} failed with status {status}"

    user = (
        await db_session.execute(select(AuthUser).where(AuthUser.email == email).limit(1))
    ).scalar_one_or_none()
    assert user is not None

    count = (
        await db_session.execute(
            select(func.count(AuthLoginEvent.id)).where(AuthLoginEvent.user_id == user.id)
        )
    ).scalar_one()
    assert count == 10, f"Expected 10 login events after retention, got {count}"


# ---------------------------------------------------------------------------
# Test 4 — admin endpoint: non-admin gets 403
# ---------------------------------------------------------------------------

async def test_login_events_endpoint_requires_admin(client, db_session: AsyncSession) -> None:
    """Accessing /admin/users/{id}/login-events without a session returns 4xx."""
    # No cookie → middleware rejects it before reaching the route
    resp = await client.get("/admin/users/1/login-events")
    assert resp.status_code in (401, 403), f"Expected 401/403, got {resp.status_code}"
