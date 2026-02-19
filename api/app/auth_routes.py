from __future__ import annotations

from datetime import timedelta
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth_utils import (
    MAX_SESSIONS_PER_USER,
    SESSION_COOKIE_NAME,
    hash_token,
    ip_prefix,
    magic_link_expiry,
    normalize_email,
    now_utc,
    session_expiry,
    ua_hash,
)
from .db import get_db
from .emailer import send_magic_link
from .models import AuthInvite, AuthMagicLink, AuthSession, AuthUser, Membership, Organization, UsageEvent, User
from .rate_limit import check_request_link_limits, check_verify_limits
from .schemas import (
    AdminInviteCreateIn,
    AdminInviteOut,
    AdminUsageOut,
    AdminUserOut,
    AuthMeOut,
    AuthRequestLinkIn,
    AuthRequestLinkOut,
)

router = APIRouter()
APP_PUBLIC_BASE_URL = os.getenv("APP_PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")
APP_ENV = os.getenv("APP_ENV", "dev").strip().lower()
INVITE_TTL_DAYS = int(os.getenv("INVITE_TTL_DAYS", "7"))


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "").strip()
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def _ensure_member_for_email(db: AsyncSession, email: str) -> tuple[int | None, int | None, str | None]:
    org = (
        await db.execute(select(Organization).where(Organization.name == "Demo Org").order_by(Organization.id.asc()).limit(1))
    ).scalar_one_or_none()
    if org is None:
        org = Organization(name="Demo Org")
        db.add(org)
        await db.flush()

    user = (
        await db.execute(select(User).where(func.lower(User.email) == email.lower()).limit(1))
    ).scalar_one_or_none()
    if user is None:
        user = User(email=email.lower(), display_name=email.split("@")[0])
        db.add(user)
        await db.flush()

    membership = (
        await db.execute(
            select(Membership).where(Membership.org_id == org.id, Membership.user_id == user.id).limit(1)
        )
    ).scalar_one_or_none()
    if membership is None:
        membership = Membership(org_id=org.id, user_id=user.id, role="member")
        db.add(membership)
        await db.flush()

    return user.id, org.id, membership.role


def _require_session_auth(request: Request) -> tuple[int, bool]:
    auth_user_id = getattr(request.state, "auth_user_id", None)
    auth_is_admin = bool(getattr(request.state, "auth_is_admin", False))
    if auth_user_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return auth_user_id, auth_is_admin


@router.post("/auth/request-link", response_model=AuthRequestLinkOut)
async def request_link(
    payload: AuthRequestLinkIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthRequestLinkOut:
    email = normalize_email(payload.email)
    ip = _client_ip(request)

    allowed, detail = check_request_link_limits(ip, email)
    if not allowed:
        raise HTTPException(status_code=429, detail=detail)

    now = now_utc()
    auth_user = (
        await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email).limit(1))
    ).scalar_one_or_none()
    active_invite = (
        await db.execute(
            select(AuthInvite)
            .where(func.lower(AuthInvite.email) == email)
            .where(AuthInvite.revoked_at.is_(None))
            .where(AuthInvite.expires_at > now)
            .order_by(AuthInvite.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if auth_user is None and active_invite is None:
        raise HTTPException(status_code=403, detail="You're not invited yet. Request access from an admin.")

    raw_token = os.urandom(32).hex()
    token_hash = hash_token(raw_token)
    link = f"{APP_PUBLIC_BASE_URL}/auth/verify?token={raw_token}"

    sent, send_status = send_magic_link(email=email, link=link, template_type="login")
    if not sent:
        raise HTTPException(status_code=500, detail="Email delivery failed")

    db.add(
        AuthMagicLink(
            email=email,
            token_hash=token_hash,
            expires_at=magic_link_expiry(),
            request_ip=ip,
            user_agent=request.headers.get("user-agent"),
            purpose="login",
            send_status=send_status,
        )
    )
    db.add(
        UsageEvent(
            user_id=auth_user.id if auth_user else None,
            event_type="login_requested",
            ip_prefix=ip_prefix(ip),
            user_agent_hash=ua_hash(request.headers.get("user-agent")),
            org_id=None,
            project_id=None,
        )
    )
    await db.commit()
    debug_link = link if APP_ENV == "dev" and send_status == "logged" else None
    return AuthRequestLinkOut(status="ok", detail="Check your email for a sign-in link.", debug_link=debug_link)


@router.get("/auth/verify")
async def verify_link(
    request: Request,
    response: Response,
    token: str = Query(min_length=10),
    db: AsyncSession = Depends(get_db),
):
    ip = _client_ip(request)
    allowed, detail = check_verify_limits(ip)
    if not allowed:
        raise HTTPException(status_code=429, detail=detail)

    now = now_utc()
    token_hash = hash_token(token)
    magic = (
        await db.execute(
            select(AuthMagicLink)
            .where(AuthMagicLink.token_hash == token_hash)
            .where(AuthMagicLink.consumed_at.is_(None))
            .where(AuthMagicLink.expires_at > now)
            .limit(1)
        )
    ).scalar_one_or_none()
    if magic is None:
        raise HTTPException(status_code=400, detail="Invalid or expired sign-in link")

    email = normalize_email(magic.email)
    auth_user = (
        await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email).limit(1))
    ).scalar_one_or_none()
    if auth_user is None:
        auth_user_count = (await db.execute(select(func.count(AuthUser.id)))).scalar_one()
        auth_user = AuthUser(email=email, is_admin=(auth_user_count == 0), invite_accepted_at=now)
        db.add(auth_user)
        await db.flush()
    if auth_user.is_disabled:
        raise HTTPException(status_code=403, detail="User is disabled")

    invite = (
        await db.execute(
            select(AuthInvite)
            .where(func.lower(AuthInvite.email) == email)
            .where(AuthInvite.revoked_at.is_(None))
            .where(AuthInvite.expires_at > now)
            .order_by(AuthInvite.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if invite is not None and invite.accepted_at is None:
        invite.accepted_at = now

    auth_user.last_login_at = now
    auth_user.invite_accepted_at = auth_user.invite_accepted_at or now

    magic.consumed_at = now

    domain_user_id, org_id, role = await _ensure_member_for_email(db, email)

    raw_session = os.urandom(32).hex()
    session_hash = hash_token(raw_session)
    new_session = AuthSession(
        user_id=auth_user.id,
        session_token_hash=session_hash,
        expires_at=session_expiry(),
        last_seen_at=now,
        ip=ip,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(new_session)
    await db.flush()

    active_sessions = (
        await db.execute(
            select(AuthSession)
            .where(AuthSession.user_id == auth_user.id)
            .where(AuthSession.revoked_at.is_(None))
            .where(AuthSession.expires_at > now)
            .order_by(AuthSession.created_at.asc(), AuthSession.id.asc())
        )
    ).scalars().all()
    overflow = len(active_sessions) - MAX_SESSIONS_PER_USER
    if overflow > 0:
        for sess in active_sessions[:overflow]:
            sess.revoked_at = now

    db.add(
        UsageEvent(
            user_id=auth_user.id,
            event_type="login_success",
            ip_prefix=ip_prefix(ip),
            user_agent_hash=ua_hash(request.headers.get("user-agent")),
            org_id=org_id,
            project_id=None,
        )
    )
    await db.commit()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_session,
        httponly=True,
        secure=APP_ENV == "prod",
        samesite="lax",
        max_age=int((new_session.expires_at - now).total_seconds()),
        expires=new_session.expires_at,
        path="/",
    )

    return {
        "status": "ok",
        "redirect_to": "/app",
        "user": {"email": auth_user.email, "is_admin": bool(auth_user.is_admin)},
        "org_id": org_id,
        "role": role,
        "user_id": domain_user_id,
    }


@router.post("/auth/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    _require_session_auth(request)
    session_id = getattr(request.state, "auth_session_id", None)
    if session_id is not None:
        session_row = (
            await db.execute(select(AuthSession).where(AuthSession.id == session_id).limit(1))
        ).scalar_one_or_none()
        if session_row is not None and session_row.revoked_at is None:
            session_row.revoked_at = now_utc()
            await db.commit()

    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.get("/auth/me", response_model=AuthMeOut)
async def auth_me(request: Request, db: AsyncSession = Depends(get_db)) -> AuthMeOut:
    auth_user_id, _ = _require_session_auth(request)
    user = (await db.execute(select(AuthUser).where(AuthUser.id == auth_user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return AuthMeOut(
        email=user.email,
        is_admin=bool(user.is_admin),
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.post("/admin/invites", response_model=AdminInviteOut, status_code=201)
async def create_invite(
    payload: AdminInviteCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminInviteOut:
    auth_user_id, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    email = normalize_email(payload.email)
    invite = AuthInvite(
        email=email,
        invited_by_user_id=auth_user_id,
        expires_at=now_utc() + timedelta(days=INVITE_TTL_DAYS),
        notes=payload.notes,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return AdminInviteOut(
        id=invite.id,
        email=invite.email,
        invited_by_user_id=invite.invited_by_user_id,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
        revoked_at=invite.revoked_at,
        notes=invite.notes,
    )


@router.get("/admin/invites", response_model=list[AdminInviteOut])
async def list_invites(request: Request, db: AsyncSession = Depends(get_db)) -> list[AdminInviteOut]:
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    rows = (
        await db.execute(select(AuthInvite).order_by(AuthInvite.created_at.desc(), AuthInvite.id.desc()))
    ).scalars().all()
    return [
        AdminInviteOut(
            id=i.id,
            email=i.email,
            invited_by_user_id=i.invited_by_user_id,
            created_at=i.created_at,
            expires_at=i.expires_at,
            accepted_at=i.accepted_at,
            revoked_at=i.revoked_at,
            notes=i.notes,
        )
        for i in rows
    ]


@router.post("/admin/invites/{invite_id}/revoke")
async def revoke_invite(invite_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    invite = (await db.execute(select(AuthInvite).where(AuthInvite.id == invite_id).limit(1))).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.revoked_at = now_utc()
    await db.commit()
    return {"status": "ok"}


@router.get("/admin/users", response_model=list[AdminUserOut])
async def list_users(request: Request, db: AsyncSession = Depends(get_db)) -> list[AdminUserOut]:
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    rows = (await db.execute(select(AuthUser).order_by(AuthUser.created_at.desc(), AuthUser.id.desc()))).scalars().all()
    return [
        AdminUserOut(
            id=u.id,
            email=u.email,
            created_at=u.created_at,
            last_login_at=u.last_login_at,
            is_admin=bool(u.is_admin),
            is_disabled=bool(u.is_disabled),
        )
        for u in rows
    ]


@router.post("/admin/users/{user_id}/disable")
async def disable_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_disabled = True
    await db.commit()
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/enable")
async def enable_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_disabled = False
    await db.commit()
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/revoke-sessions")
async def revoke_sessions(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    now = now_utc()
    sessions = (
        await db.execute(
            select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        )
    ).scalars().all()
    for session in sessions:
        session.revoked_at = now
    await db.commit()
    return {"status": "ok", "revoked": len(sessions)}


@router.get("/admin/usage", response_model=list[AdminUsageOut])
async def usage_stats(request: Request, db: AsyncSession = Depends(get_db)) -> list[AdminUsageOut]:
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    rows = (
        await db.execute(
            select(
                func.date_trunc("day", UsageEvent.created_at).label("day"),
                UsageEvent.event_type,
                func.count(UsageEvent.id).label("count"),
            )
            .group_by(func.date_trunc("day", UsageEvent.created_at), UsageEvent.event_type)
            .order_by(func.date_trunc("day", UsageEvent.created_at).desc())
            .limit(200)
        )
    ).all()

    return [
        AdminUsageOut(date=str(row.day.date()), event_type=row.event_type, count=int(row.count)) for row in rows
    ]
