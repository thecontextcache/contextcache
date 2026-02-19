from __future__ import annotations

from datetime import timedelta
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import delete, func, select
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
from .models import AuthInvite, AuthLoginEvent, AuthMagicLink, AuthSession, AuthUser, Membership, Organization, UsageEvent, User, Waitlist
from .rate_limit import check_request_link_limits, check_verify_limits
from .schemas import (
    AdminInviteCreateIn,
    AdminInviteOut,
    AdminUsageOut,
    AdminUserOut,
    AdminUserStatsOut,
    AdminWaitlistOut,
    AuthMeOut,
    AuthRequestLinkIn,
    AuthRequestLinkOut,
    LoginEventOut,
    WaitlistJoinIn,
    WaitlistJoinOut,
)

router = APIRouter()
APP_PUBLIC_BASE_URL = os.getenv("APP_PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")
APP_ENV = os.getenv("APP_ENV", "dev").strip().lower()
INVITE_TTL_DAYS = int(os.getenv("INVITE_TTL_DAYS", "7"))


_LOGIN_EVENT_RETENTION = 10  # keep only last N login events per user


def _client_ip(request: Request) -> str:
    """Extract the real client IP with Cloudflare Tunnel precedence.

    Priority:
    1. CF-Connecting-IP  — set by Cloudflare to the actual visitor IP
    2. X-Forwarded-For   — first (leftmost) entry, set by proxies/LBs
    3. request.client.host — direct connection fallback
    """
    cf_ip = request.headers.get("cf-connecting-ip", "").strip()
    if cf_ip:
        return cf_ip
    xff = request.headers.get("x-forwarded-for", "").strip()
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


_ROLE_RANK = {"viewer": 1, "member": 2, "admin": 3, "owner": 4}


async def _ensure_member_for_email(
    db: AsyncSession,
    email: str,
    is_admin: bool = False,
) -> tuple[int | None, int | None, str | None]:
    """Create/fetch the domain User + Membership for a verified auth user.

    is_admin=True → org role becomes "owner" (and existing lower roles are upgraded).
    is_admin=False → org role is "member" (never downgraded if already higher).
    """
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

    desired_role = "owner" if is_admin else "member"

    membership = (
        await db.execute(
            select(Membership).where(Membership.org_id == org.id, Membership.user_id == user.id).limit(1)
        )
    ).scalar_one_or_none()
    if membership is None:
        membership = Membership(org_id=org.id, user_id=user.id, role=desired_role)
        db.add(membership)
        await db.flush()
    elif _ROLE_RANK.get(desired_role, 0) > _ROLE_RANK.get(membership.role, 0):
        # Upgrade role when the user deserves higher access (e.g. admin flag set after initial signup).
        membership.role = desired_role

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
        # Bootstrap exception: if no AuthUsers and no AuthInvites exist yet this is a
        # fresh install. Let the very first person through so they become the admin.
        # Once any user or invite record exists this path is permanently closed.
        total_users = (await db.execute(select(func.count(AuthUser.id)))).scalar_one()
        total_invites = (await db.execute(select(func.count(AuthInvite.id)))).scalar_one()
        if total_users > 0 or total_invites > 0:
            raise HTTPException(
                status_code=403,
                detail="Invite-only alpha. Join the waitlist at /waitlist.",
            )
        # Fresh install — fall through and issue the first magic link freely.

    raw_token = os.urandom(32).hex()
    token_hash = hash_token(raw_token)
    link = f"{APP_PUBLIC_BASE_URL}/auth/verify?token={raw_token}"

    sent, send_status = send_magic_link(email=email, link=link, template_type="login")
    if not sent:
        # In prod this means SES is misconfigured or sandbox-blocked.
        # In dev the emailer always returns sent=True (falls back to log).
        raise HTTPException(
            status_code=500,
            detail="Email delivery failed. Contact your admin — SES may not be configured yet.",
        )

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
    # debug_link is a relative path so it works on any host (Tailscale, localhost, etc.)
    # The browser resolves it against its current origin — no wrong-domain issues.
    debug_link = f"/auth/verify?token={raw_token}" if APP_ENV == "dev" and send_status == "logged" else None
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

    domain_user_id, org_id, role = await _ensure_member_for_email(db, email, is_admin=auth_user.is_admin)

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

    # Record login IP — store raw user agent (capped to 512 chars, never store tokens)
    raw_ua = (request.headers.get("user-agent") or "")[:512] or None
    db.add(AuthLoginEvent(user_id=auth_user.id, ip=ip, user_agent=raw_ua))
    await db.flush()

    # Transactional retention: keep only the last _LOGIN_EVENT_RETENTION rows per user.
    # Done in the same transaction so concurrent logins cannot leave stale rows.
    keep_ids_subq = (
        select(AuthLoginEvent.id)
        .where(AuthLoginEvent.user_id == auth_user.id)
        .order_by(AuthLoginEvent.created_at.desc(), AuthLoginEvent.id.desc())
        .limit(_LOGIN_EVENT_RETENTION)
        .scalar_subquery()
    )
    await db.execute(
        delete(AuthLoginEvent)
        .where(AuthLoginEvent.user_id == auth_user.id)
        .where(AuthLoginEvent.id.not_in(keep_ids_subq))
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
            is_unlimited=bool(u.is_unlimited),
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


@router.post("/admin/users/{user_id}/grant-admin")
async def grant_admin(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    auth_user_id, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    await db.commit()
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/revoke-admin")
async def revoke_admin(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    auth_user_id, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user_id == auth_user_id:
        raise HTTPException(status_code=400, detail="You cannot revoke your own admin status.")
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = False
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


@router.post("/admin/users/{user_id}/set-unlimited")
async def set_unlimited(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    unlimited: bool = True,
):
    """Grant or remove the unlimited-usage flag for a user (admin-only).

    Query param: unlimited=true|false
    """
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_unlimited = unlimited
    await db.commit()
    return {"status": "ok", "is_unlimited": unlimited}


@router.get("/admin/users/{user_id}/stats", response_model=AdminUserStatsOut)
async def get_user_stats(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminUserStatsOut:
    """Return lightweight usage stats for a user (admin-only)."""
    from datetime import date as _date
    from sqlalchemy import func as sqla_func
    from .models import Memory, UsageCounter

    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    memory_count = (
        await db.execute(
            select(sqla_func.count(Memory.id)).where(Memory.created_by_user_id == user_id)
        )
    ).scalar_one()

    today_counter = (
        await db.execute(
            select(UsageCounter).where(
                UsageCounter.user_id == user_id,
                UsageCounter.day == _date.today(),
            ).limit(1)
        )
    ).scalar_one_or_none()

    return AdminUserStatsOut(
        user_id=user_id,
        memory_count=int(memory_count or 0),
        today_memories=int(today_counter.memories_created if today_counter else 0),
        today_recalls=int(today_counter.recall_queries if today_counter else 0),
        today_projects=int(today_counter.projects_created if today_counter else 0),
    )


@router.get("/admin/users/{user_id}/login-events", response_model=list[LoginEventOut])
async def get_user_login_events(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[LoginEventOut]:
    """Return the last 10 login IPs for a given user (admin-only)."""
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    events = (
        await db.execute(
            select(AuthLoginEvent)
            .where(AuthLoginEvent.user_id == user_id)
            .order_by(AuthLoginEvent.created_at.desc())
            .limit(_LOGIN_EVENT_RETENTION)
        )
    ).scalars().all()

    return [
        LoginEventOut(
            id=e.id,
            user_id=e.user_id,
            ip=str(e.ip),
            user_agent=e.user_agent,
            created_at=e.created_at,
        )
        for e in events
    ]


@router.get("/admin/usage", response_model=list[AdminUsageOut])
async def usage_stats(request: Request, db: AsyncSession = Depends(get_db)) -> list[AdminUsageOut]:
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        rows = (
            await db.execute(
                select(
                    func.date_trunc("day", UsageEvent.created_at).label("bucket"),
                    UsageEvent.event_type,
                    func.count(UsageEvent.id).label("event_count"),
                )
                .where(UsageEvent.created_at.isnot(None))
                .group_by(func.date_trunc("day", UsageEvent.created_at), UsageEvent.event_type)
                .order_by(func.date_trunc("day", UsageEvent.created_at).desc())
                .limit(200)
            )
        ).all()

        return [
            AdminUsageOut(
                date=str(row.bucket.date()) if row.bucket else "unknown",
                event_type=str(row.event_type),
                count=int(row.event_count),
            )
            for row in rows
        ]
    except Exception as exc:
        # Never 500 the admin panel for a stats query.
        # Logs will show the real error: docker compose logs api
        import traceback
        print(f"[WARN] usage_stats failed: {exc}")
        traceback.print_exc()
        return []


# ---------------------------------------------------------------------------
# Waitlist — public join endpoint
# ---------------------------------------------------------------------------

@router.post("/waitlist", response_model=WaitlistJoinOut)
@router.post("/waitlist/join", response_model=WaitlistJoinOut)
async def waitlist_join(
    payload: WaitlistJoinIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> WaitlistJoinOut:
    """Public endpoint — anyone can join the waitlist.

    Returns the same response whether the email is new or already waitlisted
    to avoid leaking account/invite status (anti-enumeration).
    """
    email = normalize_email(payload.email)
    ip = _client_ip(request)

    # Basic rate-limit reuse (same limits as request_link per IP)
    allowed, detail = check_request_link_limits(ip, email)
    if not allowed:
        raise HTTPException(status_code=429, detail=detail)

    existing = (
        await db.execute(select(Waitlist).where(func.lower(Waitlist.email) == email).limit(1))
    ).scalar_one_or_none()

    if existing is None:
        db.add(Waitlist(email=email))
        await db.commit()

    # Identical response for new and existing — do not reveal status
    return WaitlistJoinOut(
        status="ok",
        detail="You're on the list — we'll reach out when your spot is ready.",
    )


# ---------------------------------------------------------------------------
# Waitlist — admin management
# ---------------------------------------------------------------------------

@router.get("/admin/waitlist", response_model=list[AdminWaitlistOut])
async def list_waitlist(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[AdminWaitlistOut]:
    _, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    rows = (
        await db.execute(
            select(Waitlist).order_by(Waitlist.created_at.desc(), Waitlist.id.desc())
        )
    ).scalars().all()
    return [
        AdminWaitlistOut(
            id=w.id,
            email=w.email,
            status=w.status,
            notes=w.notes,
            created_at=w.created_at,
            reviewed_at=w.reviewed_at,
            reviewed_by_admin_id=w.reviewed_by_admin_id,
        )
        for w in rows
    ]


@router.post("/admin/waitlist/{entry_id}/approve", response_model=AdminInviteOut, status_code=201)
async def approve_waitlist(
    entry_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminInviteOut:
    """Approve a waitlist entry → creates an AuthInvite so the user can request a magic link."""
    auth_user_id, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    entry = (
        await db.execute(select(Waitlist).where(Waitlist.id == entry_id).limit(1))
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    if entry.status == "approved":
        raise HTTPException(status_code=409, detail="Entry is already approved")

    now = now_utc()
    entry.status = "approved"
    entry.reviewed_at = now
    entry.reviewed_by_admin_id = auth_user_id

    # Create invite
    invite = AuthInvite(
        email=entry.email,
        invited_by_user_id=auth_user_id,
        expires_at=now + timedelta(days=INVITE_TTL_DAYS),
        notes=f"Approved from waitlist (entry #{entry.id})",
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


@router.post("/admin/waitlist/{entry_id}/reject")
async def reject_waitlist(
    entry_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    auth_user_id, is_admin = _require_session_auth(request)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    entry = (
        await db.execute(select(Waitlist).where(Waitlist.id == entry_id).limit(1))
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    now = now_utc()
    entry.status = "rejected"
    entry.reviewed_at = now
    entry.reviewed_by_admin_id = auth_user_id
    await db.commit()
    return {"status": "ok"}
