from __future__ import annotations

from datetime import timedelta
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlparse

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
from .analyzer.algorithm import get_private_engine_runtime_state
from .analyzer.cag import evaporate_pheromones, get_cag_cache_stats
from .db import get_db
from .emailer import send_invite_email, send_magic_link, send_waitlist_rejection_email
from .models import (
    AuditLog,
    AuthInvite,
    AuthLoginEvent,
    AuthMagicLink,
    AuthSession,
    AuthUser,
    ContextCompilation,
    ContextCompilationItem,
    Membership,
    Memory,
    MemoryTag,
    Organization,
    Project,
    QueryProfile,
    RawCapture,
    RecallLog,
    RecallTiming,
    RetrievalFeedback,
    Tag,
    PlanCatalog,
    UserSubscription,
    OrgSubscription,
    UsageEvent,
    User,
    Waitlist,
)
from .rate_limit import check_request_link_limits, check_verify_limits
from .schemas import (
    AdminContextCompilationDiffOut,
    AdminContextCompilationDetailOut,
    AdminExportPayloadOut,
    AdminContextCompilationHistoryEntryOut,
    AdminContextCompilationItemOut,
    AdminContextCompilationOut,
    AdminLlmHealthOut,
    AdminQueryProfileDetailOut,
    AdminQueryProfilePreferenceIn,
    AdminRecallFeedbackOut,
    AdminInviteCreateIn,
    AdminInviteOut,
    CagCacheStatsOut,
    AdminEngineStatusOut,
    AdminOpsSummaryOut,
    AdminCaptureFailureOut,
    AdminRecallLogOut,
    AdminRecallEvalOut,
    AdminRecallMemorySignalDetailOut,
    AdminRecallMemorySignalOut,
    AdminRecallReviewQueueItemOut,
    AdminReviewNoteIn,
    AdminQueryProfileOut,
    AdminSecurityPostureOut,
    AdminUsageOut,
    AdminUserOut,
    AdminUserStatsOut,
    AdminWaitlistOut,
    AuditLogOut,
    AuthMeOut,
    AuthRequestLinkIn,
    AuthRequestLinkOut,
    LoginEventOut,
    WaitlistJoinIn,
    WaitlistJoinOut,
)

router = APIRouter()
logger = logging.getLogger(__name__)
APP_PUBLIC_BASE_URL = os.getenv("APP_PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")
APP_ENV = os.getenv("APP_ENV", "dev").strip().lower()
# Belt-and-suspenders: treat as production if APP_ENV=prod OR ENVIRONMENT=production
IS_PROD = APP_ENV == "prod" or os.getenv("ENVIRONMENT", "").strip().lower() == "production"
MAGIC_LINK_ALLOW_LOG_FALLBACK = (
    os.getenv("MAGIC_LINK_ALLOW_LOG_FALLBACK", "false").strip().lower() == "true"
)
INVITE_TTL_DAYS = int(os.getenv("INVITE_TTL_DAYS", "7"))
AUTO_JOIN_SHARED_DEMO_ORG = (
    os.getenv("AUTO_JOIN_SHARED_DEMO_ORG", "false").strip().lower() == "true"
)

# Extract the base domain for cross-subdomain cookie scoping
# Removed domain-scoping logic because it breaks heavily when hosted behind 
# Cloudflare tunnels (which use public suffixes like .trycloudflare.com).
# Browsers reject setting cookies on public suffixes, causing infinite auth loops. 
# By keeping the domain None, the browser implicitly scopes it exactly to the host.
SESSION_COOKIE_DOMAIN = None


_LOGIN_EVENT_RETENTION = 10  # keep only last N login events per user


def _query_profile_feedback_stats(profile: QueryProfile) -> tuple[int, int, int, bool]:
    positive_feedback_count = int(profile.helpful_count or 0) + int(profile.pinned_count or 0)
    negative_feedback_count = int(profile.wrong_count or 0) + int(profile.stale_count or 0) + int(profile.removed_count or 0)
    feedback_total = positive_feedback_count + negative_feedback_count
    auto_apply_enabled = (
        not bool(profile.auto_apply_disabled)
        and bool((profile.preferred_target_format or "").strip())
        and positive_feedback_count > negative_feedback_count
    )
    return feedback_total, positive_feedback_count, negative_feedback_count, auto_apply_enabled


def _query_profile_recommendation(profile: QueryProfile) -> tuple[str | None, str | None, float | None, str]:
    feedback_total, positive_feedback_count, negative_feedback_count, auto_apply_enabled = _query_profile_feedback_stats(profile)
    preferred = (profile.preferred_target_format or "").strip().lower() or None
    last_format = (profile.last_target_format or "").strip().lower() or None
    if feedback_total == 0 and not preferred:
        return None, None, None, "none"

    suggested = preferred or last_format
    if suggested is None and positive_feedback_count > 0:
        suggested = "toonx"
    if suggested is None and negative_feedback_count > 0:
        suggested = "text"
    if suggested is None:
        return None, None, None, "none"

    confidence = round(
        (max(positive_feedback_count, negative_feedback_count) / max(feedback_total, 1)),
        2,
    )
    if profile.auto_apply_disabled:
        state = "rejected"
        reason = "manually_disabled"
    elif auto_apply_enabled and preferred == suggested:
        state = "accepted"
        reason = "positive_feedback_dominates"
    elif positive_feedback_count > negative_feedback_count:
        state = "suggested"
        reason = "positive_feedback_dominates"
    elif negative_feedback_count > positive_feedback_count:
        state = "suggested"
        reason = "negative_feedback_dominates"
    else:
        state = "suggested"
        reason = "recent_usage_pattern"
    return suggested, reason, confidence, state


def _query_profile_out(profile: QueryProfile) -> AdminQueryProfileOut:
    feedback_total, positive_feedback_count, negative_feedback_count, auto_apply_enabled = _query_profile_feedback_stats(profile)
    suggested_target_format, suggestion_reason, suggestion_confidence, suggestion_state = _query_profile_recommendation(profile)
    return AdminQueryProfileOut(
        id=profile.id,
        org_id=profile.org_id,
        project_id=profile.project_id,
        actor_user_id=profile.actor_user_id,
        normalized_query=profile.normalized_query,
        sample_query=profile.sample_query,
        preferred_target_format=profile.preferred_target_format,
        last_target_format=profile.last_target_format,
        last_strategy=profile.last_strategy,
        last_served_by=profile.last_served_by,
        total_queries=profile.total_queries,
        helpful_count=profile.helpful_count,
        wrong_count=profile.wrong_count,
        stale_count=profile.stale_count,
        removed_count=profile.removed_count,
        pinned_count=profile.pinned_count,
        feedback_total=feedback_total,
        positive_feedback_count=positive_feedback_count,
        negative_feedback_count=negative_feedback_count,
        auto_apply_enabled=auto_apply_enabled,
        auto_apply_disabled=bool(profile.auto_apply_disabled),
        suggested_target_format=suggested_target_format,
        suggestion_reason=suggestion_reason,
        suggestion_confidence=suggestion_confidence,
        suggestion_state=suggestion_state,
        last_compilation_id=profile.last_compilation_id,
        last_queried_at=profile.last_queried_at,
        last_feedback_at=profile.last_feedback_at,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _normalized_target_format(value: str | None) -> str | None:
    normalized = (value or "").strip().lower()
    if not normalized:
        return None
    if normalized not in {"text", "toon", "toonx"}:
        raise HTTPException(status_code=422, detail="preferred_target_format must be one of: text, toon, toonx")
    return normalized


def _feedback_out(row: RetrievalFeedback) -> AdminRecallFeedbackOut:
    return AdminRecallFeedbackOut(
        id=row.id,
        org_id=row.org_id,
        project_id=row.project_id,
        compilation_id=row.compilation_id,
        query_profile_id=row.query_profile_id,
        actor_user_id=row.actor_user_id,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        label=row.label,
        note=row.note,
        metadata=row.metadata_json or {},
        created_at=row.created_at,
    )


def _audit_log_out(row: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=row.id,
        org_id=row.org_id,
        actor_user_id=row.actor_user_id,
        api_key_prefix=row.api_key_prefix,
        action=row.action,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        metadata=row.metadata_json or {},
        created_at=row.created_at,
    )


async def _load_admin_entity_audit(
    db: AsyncSession,
    *,
    org_id: int,
    entity_type: str,
    entity_id: int,
    limit: int = 20,
) -> list[AuditLogOut]:
    rows = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.org_id == org_id,
                AuditLog.entity_type == entity_type,
                AuditLog.entity_id == entity_id,
            )
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [_audit_log_out(row) for row in rows]


def _memory_feedback_bucket() -> dict[str, int | datetime | None]:
    return {
        "helpful_count": 0,
        "wrong_count": 0,
        "stale_count": 0,
        "removed_count": 0,
        "pinned_count": 0,
        "last_feedback_at": None,
    }


async def _load_memory_feedback_buckets(
    db: AsyncSession,
    org_id: int,
    memory_ids: list[int],
) -> dict[int, dict[str, int | datetime | None]]:
    if not memory_ids:
        return {}
    rows = (
        await db.execute(
            select(RetrievalFeedback)
            .where(
                RetrievalFeedback.org_id == org_id,
                RetrievalFeedback.entity_type == "memory",
                RetrievalFeedback.entity_id.in_(memory_ids),
            )
            .order_by(RetrievalFeedback.created_at.desc(), RetrievalFeedback.id.desc())
        )
    ).scalars().all()
    grouped: dict[int, dict[str, int | datetime | None]] = {}
    for row in rows:
        if row.entity_id is None:
            continue
        bucket = grouped.setdefault(row.entity_id, _memory_feedback_bucket())
        count_key = f"{row.label}_count"
        if count_key in bucket:
            bucket[count_key] = int(bucket[count_key] or 0) + 1
        last_feedback_at = bucket["last_feedback_at"]
        if last_feedback_at is None or row.created_at > last_feedback_at:
            bucket["last_feedback_at"] = row.created_at
    return grouped


def _memory_signal_from_bucket(
    memory: Memory,
    counts: dict[str, int | datetime | None] | None,
) -> AdminRecallMemorySignalOut:
    bucket = counts or _memory_feedback_bucket()
    helpful_count = int(bucket["helpful_count"] or 0)
    wrong_count = int(bucket["wrong_count"] or 0)
    stale_count = int(bucket["stale_count"] or 0)
    removed_count = int(bucket["removed_count"] or 0)
    pinned_count = int(bucket["pinned_count"] or 0)
    feedback_total = helpful_count + wrong_count + stale_count + removed_count + pinned_count
    net_score = helpful_count + pinned_count - wrong_count - stale_count - removed_count
    return AdminRecallMemorySignalOut(
        memory_id=memory.id,
        project_id=memory.project_id,
        memory_type=memory.type,
        title=memory.title,
        helpful_count=helpful_count,
        wrong_count=wrong_count,
        stale_count=stale_count,
        removed_count=removed_count,
        pinned_count=pinned_count,
        feedback_total=feedback_total,
        net_score=net_score,
        last_feedback_at=bucket["last_feedback_at"],
    )


def _memory_review_metadata(memory: Memory) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    metadata = dict(memory.metadata_json or {})
    notes = list(metadata.get("review_notes") or [])
    status = str(metadata.get("review_status") or ("archived" if metadata.get("archived_from_recall_admin") else "open"))
    return status, notes, metadata


async def _load_memory_tag_names(db: AsyncSession, memory_id: int) -> list[str]:
    rows = (
        await db.execute(
            select(Tag.name)
            .select_from(MemoryTag)
            .join(Tag, Tag.id == MemoryTag.tag_id)
            .where(MemoryTag.memory_id == memory_id)
            .order_by(Tag.name.asc())
        )
    ).all()
    return [str(name) for (name,) in rows]


def _client_ip(request: Request) -> str:
    """Extract the real client IP with Cloudflare Tunnel precedence.

    Priority:
    1. CF-Connecting-IP  — set by Cloudflare to the actual visitor IP
    2. request.client.host — direct connection fallback
    """
    cf_ip = request.headers.get("cf-connecting-ip", "").strip()
    if cf_ip:
        return cf_ip
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


_ROLE_RANK = {"viewer": 1, "member": 2, "admin": 3, "owner": 4}


async def _ensure_member_for_email(
    db: AsyncSession,
    email: str,
    auth_user_id: int | None = None,
    is_admin: bool = False,
) -> tuple[int | None, int | None, str | None]:
    """Create/fetch the domain User + Membership for a verified auth user.

    Default behavior (secure): each user gets a personal org on first login.
    Existing memberships are reused; role is upgraded if needed.

    Legacy behavior can be enabled with AUTO_JOIN_SHARED_DEMO_ORG=true, which
    attaches users to the shared "Demo Org" (not recommended for production).
    """
    user = None
    if auth_user_id is not None:
        user = (
            await db.execute(select(User).where(User.auth_user_id == auth_user_id).limit(1))
        ).scalar_one_or_none()
    if user is None:
        user = (
            await db.execute(select(User).where(func.lower(User.email) == email.lower()).limit(1))
        ).scalar_one_or_none()
    if user is None:
        user = User(email=email.lower(), display_name=email.split("@")[0], auth_user_id=auth_user_id)
        db.add(user)
        await db.flush()
    elif auth_user_id is not None and user.auth_user_id is None:
        user.auth_user_id = auth_user_id

    desired_role = "owner" if is_admin else "member"

    # Reuse existing membership if present.
    existing = (
        await db.execute(
            select(Membership, Organization)
            .join(Organization, Membership.org_id == Organization.id)
            .where(Membership.user_id == user.id)
            .order_by(Membership.created_at.asc(), Membership.id.asc())
            .limit(1)
        )
    ).first()
    if existing is not None:
        membership, org = existing
        if _ROLE_RANK.get(desired_role, 0) > _ROLE_RANK.get(membership.role, 0):
            membership.role = desired_role
        return user.id, org.id, membership.role

    if AUTO_JOIN_SHARED_DEMO_ORG:
        org = (
            await db.execute(
                select(Organization).where(Organization.name == "Demo Org").order_by(Organization.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if org is None:
            org = Organization(name="Demo Org")
            db.add(org)
            await db.flush()
        role_for_new_membership = desired_role
    else:
        local = (email.split("@")[0] or "user").strip()
        pretty = local.replace(".", " ").replace("_", " ").replace("-", " ").strip().title() or "User"
        org = Organization(name=f"{pretty} Org")
        db.add(org)
        await db.flush()
        # Personal org bootstrap: user must be able to self-manage API keys/settings.
        role_for_new_membership = "owner"

    membership = Membership(org_id=org.id, user_id=user.id, role=role_for_new_membership)
    db.add(membership)
    await db.flush()
    return user.id, org.id, membership.role


def _require_session_auth(request: Request) -> tuple[int, bool]:
    auth_user_id = getattr(request.state, "auth_user_id", None)
    auth_is_admin = bool(getattr(request.state, "auth_is_admin", False))
    if auth_user_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return auth_user_id, auth_is_admin


def _require_admin_auth(request: Request) -> int:
    """Allow admin access exclusively via verified global session-admin claims."""
    auth_user_id = getattr(request.state, "auth_user_id", None)
    auth_is_admin = bool(getattr(request.state, "auth_is_admin", False))
    if auth_user_id is None or not auth_is_admin:
        raise HTTPException(status_code=403, detail="Forbidden: Global admin access required")
    return auth_user_id


async def _first_membership_org_id(db: AsyncSession, auth_user_id: int) -> int | None:
    return (
        await db.execute(
            select(Membership.org_id)
            .join(User, User.id == Membership.user_id)
            .where(User.auth_user_id == auth_user_id)
            .order_by(Membership.created_at.asc(), Membership.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _resolve_admin_audit_org_id(
    db: AsyncSession,
    request: Request,
    *,
    explicit_org_id: int | None = None,
    target_auth_user_id: int | None = None,
) -> tuple[int | None, str]:

    if explicit_org_id is not None:
        return explicit_org_id, "explicit"

    actor_auth_user_id = getattr(request.state, "auth_user_id", None)
    actor_org_id = None
    if actor_auth_user_id is not None:
        actor_org_id = await _first_membership_org_id(db, int(actor_auth_user_id))

    if target_auth_user_id is not None:
        target_org_id = await _first_membership_org_id(db, target_auth_user_id)
        if target_org_id is not None:
            return target_org_id, "target_membership"
        request_org_id = getattr(request.state, "org_id", None)
        if request_org_id is not None:
            logger.warning(
                "Target auth user has no memberships; falling back to request org for admin audit.",
                extra={"target_auth_user_id": target_auth_user_id, "request_org_id": request_org_id},
            )
            return int(request_org_id), "request"
        if actor_org_id is not None:
            logger.warning(
                "Target auth user has no memberships; falling back to actor org for admin audit.",
                extra={"target_auth_user_id": target_auth_user_id, "actor_auth_user_id": actor_auth_user_id},
            )
            return actor_org_id, "actor_fallback"
        logger.error(
            "Could not resolve org for admin audit; target user has no memberships and actor has no org.",
            extra={"target_auth_user_id": target_auth_user_id, "actor_auth_user_id": actor_auth_user_id},
        )
        return None, "unresolved"

    request_org_id = getattr(request.state, "org_id", None)
    if request_org_id is not None:
        return int(request_org_id), "request"

    if actor_org_id is not None:
        return actor_org_id, "actor_membership"
    return None, "unresolved"


async def _write_admin_audit(
    db: AsyncSession,
    request: Request,
    *,
    action: str,
    entity_type: str,
    entity_id: int,
    metadata: dict | None = None,
    explicit_org_id: int | None = None,
    target_auth_user_id: int | None = None,
) -> None:
    org_id, resolution = await _resolve_admin_audit_org_id(
        db,
        request,
        explicit_org_id=explicit_org_id,
        target_auth_user_id=target_auth_user_id,
    )
    if org_id is None:
        logger.error(
            "Skipping admin audit write because no org context could be resolved.",
            extra={
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "target_auth_user_id": target_auth_user_id,
            },
        )
        return

    metadata_json = dict(metadata or {})
    actor_email = getattr(request.state, "actor_email", None)
    if actor_email and "actor_email" not in metadata_json:
        metadata_json["actor_email"] = actor_email
    if target_auth_user_id is not None and "target_auth_user_id" not in metadata_json:
        metadata_json["target_auth_user_id"] = target_auth_user_id
    if "audit_org_resolution" not in metadata_json:
        metadata_json["audit_org_resolution"] = resolution

    db.add(
        AuditLog(
            org_id=org_id,
            actor_user_id=getattr(request.state, "actor_user_id", None),
            api_key_prefix=getattr(request.state, "api_key_prefix", None),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata_json,
        )
    )


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
        code = 503 if detail and detail.startswith("Service unavailable") else 429
        raise HTTPException(status_code=code, detail=detail)

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
    debug_link = (
        f"/auth/verify?token={raw_token}"
        if send_status == "logged" and (APP_ENV == "dev" or MAGIC_LINK_ALLOW_LOG_FALLBACK)
        else None
    )
    detail_text = (
        "You're already registered. Check your email for a sign-in link."
        if auth_user is not None
        else "Check your email for a sign-in link."
    )
    return AuthRequestLinkOut(status="ok", detail=detail_text, debug_link=debug_link)


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
        code = 503 if detail and detail.startswith("Service unavailable") else 429
        raise HTTPException(status_code=code, detail=detail)

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

    domain_user_id, org_id, role = await _ensure_member_for_email(
        db,
        email,
        auth_user_id=auth_user.id,
        is_admin=auth_user.is_admin,
    )

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

    # Set Secure=true whenever the request arrived via HTTPS — not just in prod.
    # Cloudflare terminates TLS and forwards X-Forwarded-Proto: https; the
    # internal request.url.scheme is still "http" on the Docker network.
    forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
    is_https = forwarded_proto == "https" or IS_PROD
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_session,
        httponly=True,
        secure=is_https,
        samesite="lax",
        domain=SESSION_COOKIE_DOMAIN,
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

    response.delete_cookie(SESSION_COOKIE_NAME, path="/", domain=SESSION_COOKIE_DOMAIN)
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
        is_unlimited=bool(user.is_unlimited),
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.post("/admin/invites", response_model=AdminInviteOut, status_code=201)
async def create_invite(
    payload: AdminInviteCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminInviteOut:
    auth_user_id = _require_admin_auth(request)

    email = normalize_email(payload.email)
    existing_user = (
        await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == email).limit(1))
    ).scalar_one_or_none()
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="User already registered; no invite needed")

    existing_active_invite = (
        await db.execute(
            select(AuthInvite)
            .where(func.lower(AuthInvite.email) == email)
            .where(AuthInvite.revoked_at.is_(None))
            .where(AuthInvite.accepted_at.is_(None))
            .where(AuthInvite.expires_at > now_utc())
            .order_by(AuthInvite.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing_active_invite is not None:
        raise HTTPException(status_code=409, detail="Active invite already exists for this email")

    invite = AuthInvite(
        email=email,
        invited_by_user_id=auth_user_id,
        expires_at=now_utc() + timedelta(days=INVITE_TTL_DAYS),
        notes=payload.notes,
    )
    db.add(invite)
    await db.flush()
    await _write_admin_audit(
        db,
        request,
        action="admin.invite.create",
        entity_type="invite",
        entity_id=invite.id,
        metadata={"email": invite.email, "notes": invite.notes},
    )
    sent, _send_status = send_invite_email(email)
    if not sent:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Invite email delivery failed. Invite was not saved. Check SES/Resend configuration.",
        )

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
async def list_invites(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    email_q: str | None = Query(default=None, min_length=1, max_length=255),
    status: str | None = Query(default=None, pattern="^(pending|accepted|revoked)$"),
    db: AsyncSession = Depends(get_db),
) -> list[AdminInviteOut]:
    _require_admin_auth(request)

    now = now_utc()
    stmt = select(AuthInvite)
    if email_q:
        stmt = stmt.where(func.lower(AuthInvite.email).like(f"%{email_q.strip().lower()}%"))
    if status == "pending":
        stmt = stmt.where(
            AuthInvite.revoked_at.is_(None),
            AuthInvite.accepted_at.is_(None),
            AuthInvite.expires_at > now,
        )
    elif status == "accepted":
        stmt = stmt.where(AuthInvite.accepted_at.is_not(None))
    elif status == "revoked":
        stmt = stmt.where(AuthInvite.revoked_at.is_not(None))

    rows = (
        await db.execute(
            stmt
            .order_by(AuthInvite.created_at.desc(), AuthInvite.id.desc())
            .offset(offset)
            .limit(limit)
        )
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
    _require_admin_auth(request)

    invite = (await db.execute(select(AuthInvite).where(AuthInvite.id == invite_id).limit(1))).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.revoked_at = now_utc()
    await _write_admin_audit(
        db,
        request,
        action="admin.invite.revoke",
        entity_type="invite",
        entity_id=invite.id,
        metadata={"email": invite.email},
    )
    await db.commit()
    return {"status": "ok"}


@router.get("/admin/users", response_model=list[AdminUserOut])
async def list_users(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    email_q: str | None = Query(default=None, min_length=1, max_length=255),
    status: str | None = Query(default=None, pattern="^(active|disabled)$"),
    is_admin: bool | None = Query(default=None),
    is_disabled: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserOut]:
    _require_admin_auth(request)

    stmt = select(AuthUser)
    if email_q:
        stmt = stmt.where(func.lower(AuthUser.email).like(f"%{email_q.strip().lower()}%"))
    if is_admin is not None:
        stmt = stmt.where(AuthUser.is_admin.is_(is_admin))
    if status == "active":
        stmt = stmt.where(AuthUser.is_disabled.is_(False))
    elif status == "disabled":
        stmt = stmt.where(AuthUser.is_disabled.is_(True))
    if is_disabled is not None:
        stmt = stmt.where(AuthUser.is_disabled.is_(is_disabled))

    rows = (
        await db.execute(
            stmt
            .order_by(AuthUser.created_at.desc(), AuthUser.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
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
    _require_admin_auth(request)
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_disabled = True
    sessions = (
        await db.execute(
            select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        )
    ).scalars().all()
    revoked_at = now_utc()
    for session in sessions:
        session.revoked_at = revoked_at
    await _write_admin_audit(
        db,
        request,
        action="admin.user.disable",
        entity_type="auth_user",
        entity_id=user.id,
        metadata={"email": user.email, "revoked_sessions": len(sessions)},
        target_auth_user_id=user.id,
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/enable")
async def enable_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin_auth(request)
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_disabled = False
    await _write_admin_audit(
        db,
        request,
        action="admin.user.enable",
        entity_type="auth_user",
        entity_id=user.id,
        metadata={"email": user.email},
        target_auth_user_id=user.id,
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/grant-admin")
async def grant_admin(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin_auth(request)
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    await _write_admin_audit(
        db,
        request,
        action="admin.user.grant_admin",
        entity_type="auth_user",
        entity_id=user.id,
        metadata={"email": user.email},
        target_auth_user_id=user.id,
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/revoke-admin")
async def revoke_admin(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    auth_user_id, _ = _require_session_auth(request)
    if not bool(getattr(request.state, "auth_is_admin", False)):
        raise HTTPException(status_code=403, detail="Forbidden")
    if user_id == auth_user_id:
        raise HTTPException(status_code=400, detail="You cannot revoke your own admin status.")
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = False
    await _write_admin_audit(
        db,
        request,
        action="admin.user.revoke_admin",
        entity_type="auth_user",
        entity_id=user.id,
        metadata={"email": user.email},
        target_auth_user_id=user.id,
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/admin/users/{user_id}/revoke-sessions")
async def revoke_sessions(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin_auth(request)
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
    await _write_admin_audit(
        db,
        request,
        action="admin.user.revoke_sessions",
        entity_type="auth_user",
        entity_id=user.id,
        metadata={"email": user.email, "revoked_sessions": len(sessions)},
        target_auth_user_id=user.id,
    )
    await db.commit()
    return {"status": "ok", "revoked": len(sessions)}


@router.post("/admin/users/{user_id}/set-unlimited")
async def set_unlimited(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    unlimited: bool | None = None,
):
    """Grant or remove the unlimited-usage flag for a user (admin-only).

    Query param: unlimited=true|false
    """
    _require_admin_auth(request)
    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if unlimited is None:
        try:
            body = await request.json()
            if isinstance(body, dict) and "is_unlimited" in body:
                unlimited = bool(body.get("is_unlimited"))
        except Exception:
            unlimited = None
    if unlimited is None:
        unlimited = True
    user.is_unlimited = unlimited
    await _write_admin_audit(
        db,
        request,
        action="admin.user.set_unlimited",
        entity_type="auth_user",
        entity_id=user.id,
        metadata={"email": user.email, "is_unlimited": unlimited},
        target_auth_user_id=user.id,
    )
    await db.commit()
    return {"status": "ok", "is_unlimited": unlimited}


@router.post("/admin/users/{user_id}/set-plan")
async def set_user_plan(
    user_id: int,
    request: Request,
    plan_code: str = Query(..., min_length=3, max_length=20),
    db: AsyncSession = Depends(get_db),
):
    _require_admin_auth(request)
    code = plan_code.strip().lower()

    user = (await db.execute(select(AuthUser).where(AuthUser.id == user_id).limit(1))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    plan = (
        await db.execute(select(PlanCatalog).where(PlanCatalog.code == code, PlanCatalog.is_active.is_(True)).limit(1))
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{code}'")

    sub = (
        await db.execute(
            select(UserSubscription)
            .where(
                UserSubscription.auth_user_id == user_id,
                UserSubscription.status == "active",
                UserSubscription.ended_at.is_(None),
            )
            .order_by(UserSubscription.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if sub is None:
        sub = UserSubscription(auth_user_id=user_id, plan_code=code, status="active")
        db.add(sub)
        await db.flush()
    else:
        sub.plan_code = code
    now = now_utc()
    prior_active = (
        await db.execute(
            select(UserSubscription)
            .where(
                UserSubscription.auth_user_id == user_id,
                UserSubscription.status == "active",
                UserSubscription.ended_at.is_(None),
                UserSubscription.id != sub.id,
            )
        )
    ).scalars().all()
    for row in prior_active:
        row.status = "ended"
        row.ended_at = now
    await _write_admin_audit(
        db,
        request,
        action="admin.user.set_plan",
        entity_type="auth_user",
        entity_id=user.id,
        metadata={"email": user.email, "plan_code": code},
        target_auth_user_id=user.id,
    )
    await db.commit()
    return {"status": "ok", "user_id": user_id, "plan_code": code}


@router.post("/admin/orgs/{org_id}/set-plan")
async def set_org_plan(
    org_id: int,
    request: Request,
    plan_code: str = Query(..., min_length=3, max_length=20),
    db: AsyncSession = Depends(get_db),
):
    _require_admin_auth(request)
    code = plan_code.strip().lower()

    org = (await db.execute(select(Organization).where(Organization.id == org_id).limit(1))).scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    plan = (
        await db.execute(select(PlanCatalog).where(PlanCatalog.code == code, PlanCatalog.is_active.is_(True)).limit(1))
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{code}'")

    sub = (
        await db.execute(
            select(OrgSubscription)
            .where(
                OrgSubscription.org_id == org_id,
                OrgSubscription.status == "active",
                OrgSubscription.ended_at.is_(None),
            )
            .order_by(OrgSubscription.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if sub is None:
        sub = OrgSubscription(org_id=org_id, plan_code=code, status="active")
        db.add(sub)
        await db.flush()
    else:
        sub.plan_code = code
    now = now_utc()
    prior_active = (
        await db.execute(
            select(OrgSubscription)
            .where(
                OrgSubscription.org_id == org_id,
                OrgSubscription.status == "active",
                OrgSubscription.ended_at.is_(None),
                OrgSubscription.id != sub.id,
            )
        )
    ).scalars().all()
    for row in prior_active:
        row.status = "ended"
        row.ended_at = now
    await _write_admin_audit(
        db,
        request,
        action="admin.org.set_plan",
        entity_type="org",
        entity_id=org.id,
        metadata={"name": org.name, "plan_code": code},
        explicit_org_id=org.id,
    )
    await db.commit()
    return {"status": "ok", "org_id": org_id, "plan_code": code}


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

    _require_admin_auth(request)

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
    _require_admin_auth(request)

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
    _require_admin_auth(request)

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


@router.get("/admin/recall/logs", response_model=list[AdminRecallLogOut])
async def admin_recall_logs(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    project_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> list[AdminRecallLogOut]:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    stmt = select(RecallLog).where(RecallLog.org_id == org_id)
    if project_id is not None:
        stmt = stmt.where(RecallLog.project_id == project_id)

    rows = (
        await db.execute(
            stmt
            .order_by(RecallLog.created_at.desc(), RecallLog.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [
        AdminRecallLogOut(
            id=row.id,
            org_id=row.org_id,
            project_id=row.project_id,
            actor_user_id=row.actor_user_id,
            strategy=row.strategy,
            query_text=row.query_text,
            input_memory_ids=row.input_memory_ids or [],
            ranked_memory_ids=row.ranked_memory_ids or [],
            weights=row.weights_json or {},
            score_details=row.score_details_json or {},
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/admin/recall/compilations", response_model=list[AdminContextCompilationOut])
async def admin_recall_compilations(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    project_id: int | None = Query(default=None, ge=1),
    target_format: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[AdminContextCompilationOut]:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    stmt = select(ContextCompilation).where(ContextCompilation.org_id == org_id)
    if project_id is not None:
        stmt = stmt.where(ContextCompilation.project_id == project_id)
    if target_format is not None:
        normalized_format = target_format.strip().lower()
        if normalized_format:
            stmt = stmt.where(ContextCompilation.target_format == normalized_format)

    rows = (
        await db.execute(
            stmt
            .order_by(ContextCompilation.created_at.desc(), ContextCompilation.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [
        AdminContextCompilationOut(
            id=row.id,
            org_id=row.org_id,
            project_id=row.project_id,
            actor_user_id=row.actor_user_id,
            query_text=row.query_text,
            bundle_id=((row.compilation_json or {}).get("bundle") or {}).get("bundle_id"),
            target_format=row.target_format,
            renderer=(row.compilation_json or {}).get("renderer"),
            retrieval_strategy=((row.compilation_json or {}).get("retrieval_plan") or {}).get("strategy"),
            served_by=row.served_by,
            status=row.status,
            latency_ms=row.latency_ms,
            item_count=len((row.compilation_json or {}).get("items") or []),
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/admin/recall/compilations/history", response_model=list[AdminContextCompilationHistoryEntryOut])
async def admin_recall_compilation_history(
    request: Request,
    compilation_id: int | None = Query(default=None, ge=1),
    query_text: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[AdminContextCompilationHistoryEntryOut]:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    resolved_query = (query_text or "").strip()
    if compilation_id is not None and not resolved_query:
        base = (
            await db.execute(
                select(ContextCompilation)
                .where(ContextCompilation.id == compilation_id, ContextCompilation.org_id == org_id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if base is None:
            raise HTTPException(status_code=404, detail="Compilation not found")
        resolved_query = base.query_text
    if not resolved_query:
        raise HTTPException(status_code=422, detail="query_text or compilation_id is required")

    rows = (
        await db.execute(
            select(ContextCompilation)
            .where(ContextCompilation.org_id == org_id, ContextCompilation.query_text == resolved_query)
            .order_by(ContextCompilation.created_at.desc(), ContextCompilation.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    if not rows:
        return []

    feedback_counts = {
        row.compilation_id: int(row.count or 0)
        for row in (
            await db.execute(
                select(
                    RetrievalFeedback.compilation_id,
                    func.count(RetrievalFeedback.id).label("count"),
                )
                .where(RetrievalFeedback.compilation_id.in_([entry.id for entry in rows]))
                .group_by(RetrievalFeedback.compilation_id)
            )
        ).all()
    }
    return [
        AdminContextCompilationHistoryEntryOut(
            id=row.id,
            query_text=row.query_text,
            target_format=row.target_format,
            renderer=(row.compilation_json or {}).get("renderer"),
            retrieval_strategy=((row.compilation_json or {}).get("retrieval_plan") or {}).get("strategy"),
            served_by=row.served_by,
            item_count=len((row.compilation_json or {}).get("items") or []),
            feedback_count=feedback_counts.get(row.id, 0),
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/admin/recall/compilations/{compilation_id}", response_model=AdminContextCompilationDetailOut)
async def admin_recall_compilation_detail(
    compilation_id: int,
    request: Request,
    feedback_limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> AdminContextCompilationDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    compilation = (
        await db.execute(
            select(ContextCompilation)
            .where(ContextCompilation.id == compilation_id, ContextCompilation.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if compilation is None:
        raise HTTPException(status_code=404, detail="Compilation not found")

    item_rows = (
        await db.execute(
            select(ContextCompilationItem)
            .where(ContextCompilationItem.compilation_id == compilation.id)
            .order_by(ContextCompilationItem.rank.asc(), ContextCompilationItem.id.asc())
        )
    ).scalars().all()
    query_profile_id = (
        await db.execute(
            select(QueryProfile.id)
            .where(QueryProfile.last_compilation_id == compilation.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    feedback_rows = (
        await db.execute(
            select(RetrievalFeedback)
            .where(RetrievalFeedback.compilation_id == compilation.id)
            .order_by(RetrievalFeedback.created_at.desc(), RetrievalFeedback.id.desc())
            .limit(feedback_limit)
        )
    ).scalars().all()
    compilation_json = compilation.compilation_json or {}
    return AdminContextCompilationDetailOut(
        id=compilation.id,
        org_id=compilation.org_id,
        project_id=compilation.project_id,
        actor_user_id=compilation.actor_user_id,
        query_text=compilation.query_text,
        bundle_id=(compilation_json.get("bundle") or {}).get("bundle_id"),
        target_format=compilation.target_format,
        renderer=compilation_json.get("renderer"),
        retrieval_strategy=(compilation_json.get("retrieval_plan") or {}).get("strategy"),
        served_by=compilation.served_by,
        status=compilation.status,
        latency_ms=compilation.latency_ms,
        compilation_text=compilation.compilation_text,
        compilation_json=compilation_json,
        item_count=len(item_rows),
        feedback_count=len(feedback_rows),
        items=[
            AdminContextCompilationItemOut(
                id=row.id,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                rank=row.rank,
                token_estimate=row.token_estimate,
                why_included=row.why_included,
                source_kind=row.source_kind,
                created_at=row.created_at,
            )
            for row in item_rows
        ],
        recent_feedback=[
            _feedback_out(row)
            for row in feedback_rows
        ],
        query_profile_id=query_profile_id,
        created_at=compilation.created_at,
    )


@router.get("/admin/recall/compilations/{compilation_id}/diff", response_model=AdminContextCompilationDiffOut)
async def admin_recall_compilation_diff(
    compilation_id: int,
    request: Request,
    other_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> AdminContextCompilationDiffOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    base = (
        await db.execute(
            select(ContextCompilation)
            .where(ContextCompilation.id == compilation_id, ContextCompilation.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if base is None:
        raise HTTPException(status_code=404, detail="Compilation not found")

    if other_id is None:
        other = (
            await db.execute(
                select(ContextCompilation)
                .where(
                    ContextCompilation.org_id == org_id,
                    ContextCompilation.query_text == base.query_text,
                    ContextCompilation.id != base.id,
                )
                .order_by(ContextCompilation.created_at.desc(), ContextCompilation.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if other is None:
            raise HTTPException(status_code=404, detail="No comparison compilation found for query")
    else:
        other = (
            await db.execute(
                select(ContextCompilation)
                .where(ContextCompilation.id == other_id, ContextCompilation.org_id == org_id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if other is None:
            raise HTTPException(status_code=404, detail="Comparison compilation not found")

    item_rows = (
        await db.execute(
            select(ContextCompilationItem)
            .where(ContextCompilationItem.compilation_id.in_([base.id, other.id]))
        )
    ).scalars().all()
    by_compilation: dict[int, set[int]] = {base.id: set(), other.id: set()}
    for row in item_rows:
        if row.entity_id is not None and row.compilation_id in by_compilation:
            by_compilation[row.compilation_id].add(row.entity_id)
    feedback_counts = {
        row.compilation_id: int(row.count or 0)
        for row in (
            await db.execute(
                select(
                    RetrievalFeedback.compilation_id,
                    func.count(RetrievalFeedback.id).label("count"),
                )
                .where(RetrievalFeedback.compilation_id.in_([base.id, other.id]))
                .group_by(RetrievalFeedback.compilation_id)
            )
        ).all()
    }
    base_json = base.compilation_json or {}
    other_json = other.compilation_json or {}
    return AdminContextCompilationDiffOut(
        base_compilation_id=base.id,
        other_compilation_id=other.id,
        query_text=base.query_text,
        base_target_format=base.target_format,
        other_target_format=other.target_format,
        base_retrieval_strategy=(base_json.get("retrieval_plan") or {}).get("strategy"),
        other_retrieval_strategy=(other_json.get("retrieval_plan") or {}).get("strategy"),
        base_served_by=base.served_by,
        other_served_by=other.served_by,
        target_format_changed=base.target_format != other.target_format,
        retrieval_strategy_changed=((base_json.get("retrieval_plan") or {}).get("strategy")) != ((other_json.get("retrieval_plan") or {}).get("strategy")),
        served_by_changed=base.served_by != other.served_by,
        bundle_changed=((base_json.get("bundle") or {}).get("bundle_id")) != ((other_json.get("bundle") or {}).get("bundle_id")),
        text_changed=(base.compilation_text or "") != (other.compilation_text or ""),
        base_bundle_id=(base_json.get("bundle") or {}).get("bundle_id"),
        other_bundle_id=(other_json.get("bundle") or {}).get("bundle_id"),
        base_item_count=len((base_json.get("items") or [])),
        other_item_count=len((other_json.get("items") or [])),
        item_ids_added=sorted(by_compilation[base.id] - by_compilation[other.id]),
        item_ids_removed=sorted(by_compilation[other.id] - by_compilation[base.id]),
        retrieval_plan_before=other_json.get("retrieval_plan") or {},
        retrieval_plan_after=base_json.get("retrieval_plan") or {},
        feedback_delta=feedback_counts.get(base.id, 0) - feedback_counts.get(other.id, 0),
    )


@router.get("/admin/recall/compilations/{compilation_id}/export", response_model=AdminExportPayloadOut)
async def admin_export_compilation_detail(
    compilation_id: int,
    request: Request,
    feedback_limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> AdminExportPayloadOut:
    detail = await admin_recall_compilation_detail(
        compilation_id=compilation_id,
        request=request,
        feedback_limit=feedback_limit,
        db=db,
    )
    await _write_admin_audit(
        db,
        request,
        action="admin.recall.compilation.export",
        entity_type="context_compilation",
        entity_id=compilation_id,
        metadata={"export_kind": "detail", "feedback_limit": feedback_limit},
    )
    await db.commit()
    return AdminExportPayloadOut(
        export_kind="context_compilation_detail",
        filename=f"context-compilation-{compilation_id}.json",
        payload=jsonable_encoder(detail),
    )


@router.get("/admin/recall/compilations/{compilation_id}/diff/export", response_model=AdminExportPayloadOut)
async def admin_export_compilation_diff(
    compilation_id: int,
    request: Request,
    other_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> AdminExportPayloadOut:
    diff = await admin_recall_compilation_diff(
        compilation_id=compilation_id,
        request=request,
        other_id=other_id,
        db=db,
    )
    await _write_admin_audit(
        db,
        request,
        action="admin.recall.compilation_diff.export",
        entity_type="context_compilation",
        entity_id=compilation_id,
        metadata={"export_kind": "diff", "other_id": diff.other_compilation_id},
    )
    await db.commit()
    return AdminExportPayloadOut(
        export_kind="context_compilation_diff",
        filename=f"context-compilation-diff-{compilation_id}-vs-{diff.other_compilation_id}.json",
        payload=jsonable_encoder(diff),
    )


@router.get("/admin/recall/feedback", response_model=list[AdminRecallFeedbackOut])
async def admin_recall_feedback(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    project_id: int | None = Query(default=None, ge=1),
    compilation_id: int | None = Query(default=None, ge=1),
    label: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[AdminRecallFeedbackOut]:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    stmt = select(RetrievalFeedback).where(RetrievalFeedback.org_id == org_id)
    if project_id is not None:
        stmt = stmt.where(RetrievalFeedback.project_id == project_id)
    if compilation_id is not None:
        stmt = stmt.where(RetrievalFeedback.compilation_id == compilation_id)
    if label is not None:
        normalized_label = label.strip().lower()
        if normalized_label:
            stmt = stmt.where(RetrievalFeedback.label == normalized_label)

    rows = (
        await db.execute(
            stmt
            .order_by(RetrievalFeedback.created_at.desc(), RetrievalFeedback.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [
        AdminRecallFeedbackOut(
            id=row.id,
            org_id=row.org_id,
            project_id=row.project_id,
            compilation_id=row.compilation_id,
            query_profile_id=row.query_profile_id,
            actor_user_id=row.actor_user_id,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            label=row.label,
            note=row.note,
            metadata=row.metadata_json or {},
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/admin/recall/memory-signals", response_model=list[AdminRecallMemorySignalOut])
async def admin_recall_memory_signals(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    project_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> list[AdminRecallMemorySignalOut]:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    stmt = select(RetrievalFeedback).where(
        RetrievalFeedback.org_id == org_id,
        RetrievalFeedback.entity_type == "memory",
        RetrievalFeedback.entity_id.is_not(None),
    )
    if project_id is not None:
        stmt = stmt.where(RetrievalFeedback.project_id == project_id)
    feedback_rows = (
        await db.execute(
            stmt.order_by(RetrievalFeedback.created_at.desc(), RetrievalFeedback.id.desc())
        )
    ).scalars().all()
    if not feedback_rows:
        return []

    grouped: dict[int, dict[str, int | datetime | None]] = {}
    for row in feedback_rows:
        if row.entity_id is None:
            continue
        bucket = grouped.setdefault(
            row.entity_id,
            {
                "project_id": row.project_id,
                "helpful_count": 0,
                "wrong_count": 0,
                "stale_count": 0,
                "removed_count": 0,
                "pinned_count": 0,
                "last_feedback_at": None,
            },
        )
        count_key = f"{row.label}_count"
        if count_key in bucket:
            bucket[count_key] = int(bucket[count_key] or 0) + 1
        last_feedback_at = bucket["last_feedback_at"]
        if last_feedback_at is None or row.created_at > last_feedback_at:
            bucket["last_feedback_at"] = row.created_at

    ranked_memory_ids = sorted(
        grouped,
        key=lambda memory_id: (
            -(
                int(grouped[memory_id]["wrong_count"] or 0)
                + int(grouped[memory_id]["stale_count"] or 0)
                + int(grouped[memory_id]["removed_count"] or 0)
                + int(grouped[memory_id]["pinned_count"] or 0)
                + int(grouped[memory_id]["helpful_count"] or 0)
            ),
            -(memory_id),
        ),
    )[:limit]
    memories = (
        await db.execute(
            select(Memory).where(Memory.id.in_(ranked_memory_ids))
        )
    ).scalars().all()
    memory_by_id = {memory.id: memory for memory in memories}
    rows: list[AdminRecallMemorySignalOut] = []
    for memory_id in ranked_memory_ids:
        memory = memory_by_id.get(memory_id)
        if memory is None:
            continue
        counts = grouped[memory_id]
        helpful_count = int(counts["helpful_count"] or 0)
        wrong_count = int(counts["wrong_count"] or 0)
        stale_count = int(counts["stale_count"] or 0)
        removed_count = int(counts["removed_count"] or 0)
        pinned_count = int(counts["pinned_count"] or 0)
        feedback_total = helpful_count + wrong_count + stale_count + removed_count + pinned_count
        net_score = helpful_count + pinned_count - wrong_count - stale_count - removed_count
        rows.append(
            AdminRecallMemorySignalOut(
                memory_id=memory.id,
                project_id=memory.project_id,
                memory_type=memory.type,
                title=memory.title,
                helpful_count=helpful_count,
                wrong_count=wrong_count,
                stale_count=stale_count,
                removed_count=removed_count,
                pinned_count=pinned_count,
                feedback_total=feedback_total,
                net_score=net_score,
                last_feedback_at=counts["last_feedback_at"],
            )
        )
    return rows


@router.get("/admin/recall/review-queue", response_model=list[AdminRecallReviewQueueItemOut])
async def admin_recall_review_queue(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    project_id: int | None = Query(default=None, ge=1),
    review_status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    net_direction: str | None = Query(default=None),
    include_archived: bool = Query(default=True),
    include_resolved: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> list[AdminRecallReviewQueueItemOut]:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    stmt = (
        select(Memory)
        .join(Project, Project.id == Memory.project_id)
        .where(Project.org_id == org_id)
        .order_by(func.coalesce(Memory.updated_at, Memory.created_at).desc(), Memory.id.desc())
    )
    if project_id is not None:
        stmt = stmt.where(Memory.project_id == project_id)
    normalized_search = (search or "").strip()
    if normalized_search:
        pattern = f"%{normalized_search}%"
        stmt = stmt.where(
            or_(
                Memory.title.ilike(pattern),
                Memory.content.ilike(pattern),
                Memory.source.ilike(pattern),
            )
        )

    memories = (await db.execute(stmt)).scalars().all()
    normalized_status = (review_status or "").strip().lower()
    if normalized_status and normalized_status not in {"open", "resolved", "archived"}:
        raise HTTPException(status_code=422, detail="review_status must be one of: open, resolved, archived")
    normalized_net = (net_direction or "").strip().lower()
    if normalized_net and normalized_net not in {"positive", "negative", "neutral"}:
        raise HTTPException(status_code=422, detail="net_direction must be one of: positive, negative, neutral")
    flagged: list[Memory] = []
    for memory in memories:
        review_status, review_notes, metadata = _memory_review_metadata(memory)
        marked_for_review = bool(metadata.get("marked_for_review"))
        archived = bool(metadata.get("archived_from_recall_admin"))
        if not marked_for_review and not archived and review_status != "resolved":
            continue
        if archived and not include_archived:
            continue
        if review_status == "resolved" and not include_resolved:
            continue
        if normalized_status and review_status != normalized_status:
            continue
        flagged.append(memory)

    buckets = await _load_memory_feedback_buckets(db, org_id, [memory.id for memory in flagged])
    filtered: list[tuple[Memory, AdminRecallMemorySignalOut, str, list[dict[str, Any]], dict[str, Any]]] = []
    for memory in flagged:
        signal = _memory_signal_from_bucket(memory, buckets.get(memory.id))
        if normalized_net == "positive" and signal.net_score <= 0:
            continue
        if normalized_net == "negative" and signal.net_score >= 0:
            continue
        if normalized_net == "neutral" and signal.net_score != 0:
            continue
        status, review_notes, metadata = _memory_review_metadata(memory)
        filtered.append((memory, signal, status, review_notes, metadata))

    page = filtered[offset:offset + limit]
    rows: list[AdminRecallReviewQueueItemOut] = []
    for memory, signal, review_status, review_notes, metadata in page:
        rows.append(
            AdminRecallReviewQueueItemOut(
                memory_id=memory.id,
                project_id=memory.project_id,
                memory_type=memory.type,
                title=memory.title,
                source=memory.source,
                feedback_total=signal.feedback_total,
                net_score=signal.net_score,
                review_status=review_status,
                marked_for_review=bool(metadata.get("marked_for_review")),
                archived_from_recall_admin=bool(metadata.get("archived_from_recall_admin")),
                review_marked_at=metadata.get("review_marked_at"),
                archived_at=metadata.get("archived_from_recall_admin_at"),
                latest_note=str((review_notes[0] or {}).get("note")) if review_notes else None,
                notes_count=len(review_notes),
                last_feedback_at=signal.last_feedback_at,
                created_at=memory.created_at,
                updated_at=memory.updated_at,
            )
        )
    return rows


@router.get("/admin/recall/memory-signals/{memory_id}", response_model=AdminRecallMemorySignalDetailOut)
async def admin_recall_memory_signal_detail(
    memory_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminRecallMemorySignalDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    memory = (
        await db.execute(
            select(Memory)
            .join(Project, Project.id == Memory.project_id)
            .where(Memory.id == memory_id, Project.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    feedback_rows = (
        await db.execute(
            select(RetrievalFeedback)
            .where(
                RetrievalFeedback.org_id == org_id,
                RetrievalFeedback.entity_type == "memory",
                RetrievalFeedback.entity_id == memory_id,
            )
            .order_by(RetrievalFeedback.created_at.desc(), RetrievalFeedback.id.desc())
        )
    ).scalars().all()
    counts = {"helpful": 0, "wrong": 0, "stale": 0, "removed": 0, "pinned": 0}
    last_feedback_at = None
    for row in feedback_rows:
        if row.label in counts:
            counts[row.label] += 1
        if last_feedback_at is None or row.created_at > last_feedback_at:
            last_feedback_at = row.created_at
    feedback_total = sum(counts.values())
    net_score = counts["helpful"] + counts["pinned"] - counts["wrong"] - counts["stale"] - counts["removed"]
    review_status, review_notes, metadata = _memory_review_metadata(memory)
    return AdminRecallMemorySignalDetailOut(
        memory_id=memory.id,
        project_id=memory.project_id,
        memory_type=memory.type,
        title=memory.title,
        helpful_count=counts["helpful"],
        wrong_count=counts["wrong"],
        stale_count=counts["stale"],
        removed_count=counts["removed"],
        pinned_count=counts["pinned"],
        feedback_total=feedback_total,
        net_score=net_score,
        last_feedback_at=last_feedback_at,
        source=memory.source,
        content=memory.content,
        tags=await _load_memory_tag_names(db, memory.id),
        metadata=metadata,
        marked_for_review=bool(metadata.get("marked_for_review")),
        archived_from_recall_admin=bool(metadata.get("archived_from_recall_admin")),
        review_status=review_status,
        review_notes=review_notes,
        created_at=memory.created_at,
        updated_at=memory.updated_at,
    )


@router.post("/admin/recall/memory-signals/{memory_id}/mark-review", response_model=AdminRecallMemorySignalDetailOut)
async def admin_mark_memory_signal_for_review(
    memory_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminRecallMemorySignalDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    actor_user_id = getattr(request.state, "auth_user_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    memory = (
        await db.execute(
            select(Memory)
            .join(Project, Project.id == Memory.project_id)
            .where(Memory.id == memory_id, Project.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    metadata = dict(memory.metadata_json or {})
    metadata["marked_for_review"] = True
    metadata["review_status"] = "open"
    metadata["review_marked_at"] = now_utc().isoformat()
    metadata["review_marked_by_user_id"] = actor_user_id
    memory.metadata_json = metadata
    await db.commit()
    await db.refresh(memory)
    return await admin_recall_memory_signal_detail(memory_id=memory_id, request=request, db=db)


@router.post("/admin/recall/memory-signals/{memory_id}/archive", response_model=AdminRecallMemorySignalDetailOut)
async def admin_archive_memory_signal(
    memory_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminRecallMemorySignalDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    actor_user_id = getattr(request.state, "auth_user_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    memory = (
        await db.execute(
            select(Memory)
            .join(Project, Project.id == Memory.project_id)
            .where(Memory.id == memory_id, Project.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    metadata = dict(memory.metadata_json or {})
    metadata["archived_from_recall_admin"] = True
    metadata["review_status"] = "archived"
    metadata["archived_from_recall_admin_at"] = now_utc().isoformat()
    metadata["archived_from_recall_admin_by_user_id"] = actor_user_id
    memory.metadata_json = metadata
    await db.commit()
    await db.refresh(memory)
    return await admin_recall_memory_signal_detail(memory_id=memory_id, request=request, db=db)


@router.post("/admin/recall/memory-signals/{memory_id}/resolve", response_model=AdminRecallMemorySignalDetailOut)
async def admin_resolve_memory_signal_review(
    memory_id: int,
    payload: AdminReviewNoteIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminRecallMemorySignalDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    actor_user_id = getattr(request.state, "auth_user_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    memory = (
        await db.execute(
            select(Memory)
            .join(Project, Project.id == Memory.project_id)
            .where(Memory.id == memory_id, Project.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    _, review_notes, metadata = _memory_review_metadata(memory)
    metadata["marked_for_review"] = False
    metadata["review_status"] = "resolved"
    metadata["review_resolved_at"] = now_utc().isoformat()
    metadata["review_resolved_by_user_id"] = actor_user_id
    if payload.note:
        review_notes.insert(0, {"status": "resolved", "note": payload.note, "created_at": now_utc().isoformat(), "user_id": actor_user_id})
    metadata["review_notes"] = review_notes[:20]
    memory.metadata_json = metadata
    await db.commit()
    await db.refresh(memory)
    return await admin_recall_memory_signal_detail(memory_id=memory_id, request=request, db=db)


@router.post("/admin/recall/memory-signals/{memory_id}/reopen", response_model=AdminRecallMemorySignalDetailOut)
async def admin_reopen_memory_signal_review(
    memory_id: int,
    payload: AdminReviewNoteIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminRecallMemorySignalDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    actor_user_id = getattr(request.state, "auth_user_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    memory = (
        await db.execute(
            select(Memory)
            .join(Project, Project.id == Memory.project_id)
            .where(Memory.id == memory_id, Project.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    _, review_notes, metadata = _memory_review_metadata(memory)
    metadata["marked_for_review"] = True
    metadata["review_status"] = "open"
    metadata["review_reopened_at"] = now_utc().isoformat()
    metadata["review_reopened_by_user_id"] = actor_user_id
    if payload.note:
        review_notes.insert(0, {"status": "reopened", "note": payload.note, "created_at": now_utc().isoformat(), "user_id": actor_user_id})
    metadata["review_notes"] = review_notes[:20]
    memory.metadata_json = metadata
    await db.commit()
    await db.refresh(memory)
    return await admin_recall_memory_signal_detail(memory_id=memory_id, request=request, db=db)


@router.post("/admin/recall/memory-signals/{memory_id}/note", response_model=AdminRecallMemorySignalDetailOut)
async def admin_note_memory_signal_review(
    memory_id: int,
    payload: AdminReviewNoteIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminRecallMemorySignalDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    actor_user_id = getattr(request.state, "auth_user_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    if not (payload.note or "").strip():
        raise HTTPException(status_code=422, detail="note is required")

    memory = (
        await db.execute(
            select(Memory)
            .join(Project, Project.id == Memory.project_id)
            .where(Memory.id == memory_id, Project.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    review_status, review_notes, metadata = _memory_review_metadata(memory)
    review_notes.insert(0, {"status": review_status, "note": payload.note, "created_at": now_utc().isoformat(), "user_id": actor_user_id})
    metadata["review_notes"] = review_notes[:20]
    memory.metadata_json = metadata
    await db.commit()
    await db.refresh(memory)
    return await admin_recall_memory_signal_detail(memory_id=memory_id, request=request, db=db)


@router.get("/admin/ops/summary", response_model=AdminOpsSummaryOut)
async def admin_ops_summary(
    request: Request,
    stale_minutes: int = Query(default=60, ge=1, le=24 * 60),
    recent_limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> AdminOpsSummaryOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    cutoff = now_utc() - timedelta(minutes=stale_minutes)
    activity_at = func.coalesce(
        RawCapture.processing_started_at,
        RawCapture.last_error_at,
        RawCapture.captured_at,
    )

    async def _count(status: str) -> int:
        return int(
            (
                await db.execute(
                    select(func.count(RawCapture.id)).where(
                        RawCapture.org_id == org_id,
                        RawCapture.processed_at.is_(None),
                        RawCapture.processing_status == status,
                    )
                )
            ).scalar_one()
            or 0
        )

    queued_count, processing_count, failed_count, dead_letter_count = (
        await _count("queued"),
        await _count("processing"),
        await _count("failed"),
        await _count("dead_letter"),
    )
    stale_capture_count = int(
        (
            await db.execute(
                select(func.count(RawCapture.id)).where(
                    RawCapture.org_id == org_id,
                    RawCapture.processed_at.is_(None),
                    RawCapture.processing_status.in_(["queued", "processing", "failed"]),
                    activity_at < cutoff,
                )
            )
        ).scalar_one()
        or 0
    )
    recent_rows = (
        await db.execute(
            select(RawCapture)
            .where(
                RawCapture.org_id == org_id,
                RawCapture.processed_at.is_(None),
                RawCapture.processing_status.in_(["failed", "dead_letter"]),
            )
            .order_by(
                func.coalesce(
                    RawCapture.dead_lettered_at,
                    RawCapture.last_error_at,
                    RawCapture.captured_at,
                ).desc(),
                RawCapture.id.desc(),
            )
            .limit(recent_limit)
        )
    ).scalars().all()
    worker_enabled = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"
    return AdminOpsSummaryOut(
        worker_enabled=worker_enabled,
        stale_minutes=stale_minutes,
        queued_count=queued_count,
        processing_count=processing_count,
        failed_count=failed_count,
        dead_letter_count=dead_letter_count,
        stale_capture_count=stale_capture_count,
        recent_capture_failures=[
            AdminCaptureFailureOut(
                id=row.id,
                project_id=row.project_id,
                processing_status=row.processing_status,
                attempt_count=row.attempt_count,
                last_error=row.last_error,
                last_error_at=row.last_error_at,
                dead_lettered_at=row.dead_lettered_at,
            )
            for row in recent_rows
        ],
    )


@router.get("/admin/recall/eval", response_model=AdminRecallEvalOut)
async def admin_recall_eval(
    request: Request,
    lookback_days: int = Query(default=7, ge=1, le=90),
    project_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> AdminRecallEvalOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    cutoff = now_utc() - timedelta(days=lookback_days)
    log_stmt = select(RecallLog).where(RecallLog.org_id == org_id, RecallLog.created_at >= cutoff)
    timing_stmt = select(RecallTiming).where(RecallTiming.org_id == org_id, RecallTiming.created_at >= cutoff)
    feedback_stmt = select(RetrievalFeedback).where(RetrievalFeedback.org_id == org_id, RetrievalFeedback.created_at >= cutoff)
    query_profile_stmt = select(QueryProfile).where(QueryProfile.org_id == org_id)
    if project_id is not None:
        log_stmt = log_stmt.where(RecallLog.project_id == project_id)
        timing_stmt = timing_stmt.where(RecallTiming.project_id == project_id)
        feedback_stmt = feedback_stmt.where(RetrievalFeedback.project_id == project_id)
        query_profile_stmt = query_profile_stmt.where(QueryProfile.project_id == project_id)

    logs = (await db.execute(log_stmt.order_by(RecallLog.created_at.desc(), RecallLog.id.desc()))).scalars().all()
    timings = (
        await db.execute(timing_stmt.order_by(RecallTiming.created_at.desc(), RecallTiming.id.desc()))
    ).scalars().all()
    feedback_rows = (
        await db.execute(feedback_stmt.order_by(RetrievalFeedback.created_at.desc(), RetrievalFeedback.id.desc()))
    ).scalars().all()
    query_profiles = (await db.execute(query_profile_stmt.order_by(QueryProfile.id.desc()))).scalars().all()

    strategy_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    feedback_label_counts: dict[str, int] = {}
    preferred_format_counts: dict[str, int] = {}
    empty_query_count = 0
    no_result_count = 0
    ranked_result_total = 0

    for row in logs:
        strategy_counts[row.strategy] = strategy_counts.get(row.strategy, 0) + 1
        if not row.query_text.strip():
            empty_query_count += 1
        ranked_ids = list(row.ranked_memory_ids or [])
        ranked_result_total += len(ranked_ids)
        if row.query_text.strip() and row.strategy != "cag" and not ranked_ids:
            no_result_count += 1
        source = (row.score_details_json or {}).get("source")
        if isinstance(source, str) and source.strip():
            source_counts[source] = source_counts.get(source, 0) + 1

    served_by_counts: dict[str, int] = {}
    total_durations = [int(row.total_duration_ms) for row in timings]
    cag_durations = [int(row.cag_duration_ms) for row in timings if row.cag_duration_ms is not None]
    rag_durations = [int(row.rag_duration_ms) for row in timings if row.rag_duration_ms is not None]
    for row in timings:
        served_by_counts[row.served_by] = served_by_counts.get(row.served_by, 0) + 1
    for row in feedback_rows:
        feedback_label_counts[row.label] = feedback_label_counts.get(row.label, 0) + 1
    for row in query_profiles:
        preferred_format = (row.preferred_target_format or "").strip()
        _, _, _, auto_apply_enabled = _query_profile_feedback_stats(row)
        if preferred_format and auto_apply_enabled:
            preferred_format_counts[preferred_format] = preferred_format_counts.get(preferred_format, 0) + 1

    def _avg(values: list[int]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 2)

    return AdminRecallEvalOut(
        lookback_days=lookback_days,
        total_queries=len(logs),
        empty_query_count=empty_query_count,
        no_result_count=no_result_count,
        total_feedback=len(feedback_rows),
        query_profile_count=len(query_profiles),
        strategy_counts=strategy_counts,
        served_by_counts=served_by_counts,
        source_counts=source_counts,
        feedback_label_counts=feedback_label_counts,
        preferred_format_counts=preferred_format_counts,
        avg_ranked_results=round(ranked_result_total / len(logs), 2) if logs else None,
        avg_total_duration_ms=_avg(total_durations),
        avg_cag_duration_ms=_avg(cag_durations),
        avg_rag_duration_ms=_avg(rag_durations),
        max_total_duration_ms=max(total_durations) if total_durations else None,
    )


@router.get("/admin/recall/query-profiles", response_model=list[AdminQueryProfileOut])
async def admin_recall_query_profiles(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    project_id: int | None = Query(default=None, ge=1),
    preferred_target_format: str | None = Query(default=None),
    has_feedback: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[AdminQueryProfileOut]:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    stmt = select(QueryProfile).where(QueryProfile.org_id == org_id)
    if project_id is not None:
        stmt = stmt.where(QueryProfile.project_id == project_id)
    if preferred_target_format is not None:
        normalized_format = preferred_target_format.strip().lower()
        if normalized_format:
            stmt = stmt.where(func.lower(QueryProfile.preferred_target_format) == normalized_format)
    if has_feedback is True:
        stmt = stmt.where(
            (QueryProfile.helpful_count + QueryProfile.wrong_count + QueryProfile.stale_count + QueryProfile.removed_count + QueryProfile.pinned_count) > 0
        )
    if has_feedback is False:
        stmt = stmt.where(
            (QueryProfile.helpful_count + QueryProfile.wrong_count + QueryProfile.stale_count + QueryProfile.removed_count + QueryProfile.pinned_count) == 0
        )

    rows = (
        await db.execute(
            stmt
            .order_by(
                func.coalesce(QueryProfile.last_feedback_at, QueryProfile.last_queried_at, QueryProfile.updated_at).desc(),
                QueryProfile.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [_query_profile_out(row) for row in rows]


@router.get("/admin/recall/query-profiles/{profile_id}", response_model=AdminQueryProfileDetailOut)
async def admin_recall_query_profile_detail(
    profile_id: int,
    request: Request,
    feedback_limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> AdminQueryProfileDetailOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    profile = (
        await db.execute(
            select(QueryProfile)
            .where(QueryProfile.id == profile_id, QueryProfile.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Query profile not found")

    feedback_rows = (
        await db.execute(
            select(RetrievalFeedback)
            .where(RetrievalFeedback.query_profile_id == profile.id)
            .order_by(RetrievalFeedback.created_at.desc(), RetrievalFeedback.id.desc())
            .limit(feedback_limit)
        )
    ).scalars().all()
    return AdminQueryProfileDetailOut(
        **_query_profile_out(profile).model_dump(),
        recent_feedback=[
            _feedback_out(row)
            for row in feedback_rows
        ],
        recent_admin_actions=await _load_admin_entity_audit(
            db,
            org_id=org_id,
            entity_type="query_profile",
            entity_id=profile.id,
            limit=20,
        ),
    )


@router.post("/admin/recall/query-profiles/{profile_id}/preferred-format", response_model=AdminQueryProfileOut)
async def admin_set_query_profile_preferred_format(
    profile_id: int,
    payload: AdminQueryProfilePreferenceIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminQueryProfileOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    profile = (
        await db.execute(
            select(QueryProfile)
            .where(QueryProfile.id == profile_id, QueryProfile.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Query profile not found")

    profile.preferred_target_format = _normalized_target_format(payload.preferred_target_format)
    await _write_admin_audit(
        db,
        request,
        action="admin.recall.query_profile.set_preferred_format",
        entity_type="query_profile",
        entity_id=profile.id,
        metadata={"preferred_target_format": profile.preferred_target_format},
    )
    await db.commit()
    await db.refresh(profile)
    return _query_profile_out(profile)


@router.post("/admin/recall/query-profiles/{profile_id}/accept-suggestion", response_model=AdminQueryProfileOut)
async def admin_accept_query_profile_suggestion(
    profile_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminQueryProfileOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    profile = (
        await db.execute(
            select(QueryProfile)
            .where(QueryProfile.id == profile_id, QueryProfile.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Query profile not found")

    suggested, _, _, _ = _query_profile_recommendation(profile)
    if not suggested:
        raise HTTPException(status_code=409, detail="No suggestion available")
    profile.preferred_target_format = suggested
    profile.auto_apply_disabled = False
    await _write_admin_audit(
        db,
        request,
        action="admin.recall.query_profile.accept_suggestion",
        entity_type="query_profile",
        entity_id=profile.id,
        metadata={"accepted_target_format": suggested},
    )
    await db.commit()
    await db.refresh(profile)
    return _query_profile_out(profile)


@router.post("/admin/recall/query-profiles/{profile_id}/reject-suggestion", response_model=AdminQueryProfileOut)
async def admin_reject_query_profile_suggestion(
    profile_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminQueryProfileOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    profile = (
        await db.execute(
            select(QueryProfile)
            .where(QueryProfile.id == profile_id, QueryProfile.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Query profile not found")

    profile.auto_apply_disabled = True
    await _write_admin_audit(
        db,
        request,
        action="admin.recall.query_profile.reject_suggestion",
        entity_type="query_profile",
        entity_id=profile.id,
        metadata={},
    )
    await db.commit()
    await db.refresh(profile)
    return _query_profile_out(profile)


@router.post("/admin/recall/query-profiles/{profile_id}/disable-auto-apply", response_model=AdminQueryProfileOut)
async def admin_disable_query_profile_auto_apply(
    profile_id: int,
    request: Request,
    disabled: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
) -> AdminQueryProfileOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    profile = (
        await db.execute(
            select(QueryProfile)
            .where(QueryProfile.id == profile_id, QueryProfile.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Query profile not found")

    profile.auto_apply_disabled = disabled
    await _write_admin_audit(
        db,
        request,
        action="admin.recall.query_profile.disable_auto_apply",
        entity_type="query_profile",
        entity_id=profile.id,
        metadata={"disabled": disabled},
    )
    await db.commit()
    await db.refresh(profile)
    return _query_profile_out(profile)


@router.post("/admin/recall/query-profiles/{profile_id}/reset-feedback", response_model=AdminQueryProfileOut)
async def admin_reset_query_profile_feedback(
    profile_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdminQueryProfileOut:
    _require_admin_auth(request)
    org_id = getattr(request.state, "org_id", None)
    if org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    profile = (
        await db.execute(
            select(QueryProfile)
            .where(QueryProfile.id == profile_id, QueryProfile.org_id == org_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Query profile not found")

    profile.helpful_count = 0
    profile.wrong_count = 0
    profile.stale_count = 0
    profile.removed_count = 0
    profile.pinned_count = 0
    profile.last_feedback_at = None
    profile.preferred_target_format = None
    await _write_admin_audit(
        db,
        request,
        action="admin.recall.query_profile.reset_feedback",
        entity_type="query_profile",
        entity_id=profile.id,
        metadata={},
    )
    await db.commit()
    await db.refresh(profile)
    return _query_profile_out(profile)


@router.get("/admin/cag/cache-stats", response_model=CagCacheStatsOut)
async def admin_cag_cache_stats(request: Request) -> CagCacheStatsOut:
    _require_admin_auth(request)
    stats = get_cag_cache_stats()
    return CagCacheStatsOut(**stats)


@router.post("/admin/cag/evaporate", response_model=CagCacheStatsOut)
async def admin_cag_evaporate(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CagCacheStatsOut:
    _require_admin_auth(request)
    evaporate_pheromones()
    stats = get_cag_cache_stats()
    await _write_admin_audit(
        db,
        request,
        action="admin.cag.evaporate",
        entity_type="cag_cache",
        entity_id=0,
        metadata={
            "cache_items": stats.get("cache_items", 0),
            "total_evicted": stats.get("total_evicted", 0),
            "avg_pheromone": stats.get("avg_pheromone", 0.0),
            "mode": stats.get("mode"),
        },
    )
    await db.commit()
    return CagCacheStatsOut(**stats)


@router.get("/admin/system/llm-health", response_model=AdminLlmHealthOut)
async def admin_llm_health(request: Request) -> AdminLlmHealthOut:
    _require_admin_auth(request)
    provider = "gemini"
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"
    worker_enabled = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if len(api_key) >= 2 and api_key[0] == api_key[-1] and api_key[0] in ('"', "'"):
        api_key = api_key[1:-1].strip()

    google_genai_installed = True
    try:
        from google import genai as _genai  # noqa: F401
    except Exception:
        google_genai_installed = False

    notes: list[str] = []
    if not worker_enabled:
        notes.append("WORKER_ENABLED is false; async refinery tasks will not run.")
    if not api_key:
        notes.append("GOOGLE_API_KEY is missing or empty.")
    if not google_genai_installed:
        notes.append("google-genai package is not installed in runtime image.")
    if not notes:
        notes.append("LLM extraction prerequisites are configured.")

    ready = worker_enabled and bool(api_key) and google_genai_installed
    return AdminLlmHealthOut(
        provider=provider,
        model=model,
        worker_enabled=worker_enabled,
        google_api_key_configured=bool(api_key),
        google_genai_installed=google_genai_installed,
        ready=ready,
        notes=notes,
    )


@router.get("/admin/system/engine-status", response_model=AdminEngineStatusOut)
async def admin_engine_status(request: Request) -> AdminEngineStatusOut:
    _require_admin_auth(request)
    return AdminEngineStatusOut(**get_private_engine_runtime_state())


@router.get("/admin/security/posture", response_model=AdminSecurityPostureOut)
async def admin_security_posture(request: Request) -> AdminSecurityPostureOut:
    _require_admin_auth(request)
    integration_secret_configured = bool(os.getenv("INTEGRATION_SIGNING_SECRET", "").strip())
    allow_legacy_signature = os.getenv("INTEGRATION_ALLOW_LEGACY_SIGNATURE", "true").strip().lower() == "true"
    signature_max_age_seconds = int(os.getenv("INTEGRATION_SIGNATURE_MAX_AGE_SECONDS", "300"))
    worker_enabled = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"
    private_engine = get_private_engine_runtime_state()
    if not integration_secret_configured:
        signature_mode = "disabled"
    elif allow_legacy_signature:
        signature_mode = "optional_timestamp"
    else:
        signature_mode = "strict_timestamp"

    notes: list[str] = []
    if MAGIC_LINK_ALLOW_LOG_FALLBACK:
        notes.append("Magic-link log fallback is enabled.")
    if signature_mode == "disabled":
        notes.append("Integration signing secret is not configured.")
    elif signature_mode == "optional_timestamp":
        notes.append("Timestamped signatures are supported, but legacy body-only signatures are still accepted.")
    else:
        notes.append("Integration signatures require a fresh timestamp header.")
    if not private_engine.get("configured", False):
        notes.append("Private engine package is not configured; protected extraction paths will fail closed.")

    return AdminSecurityPostureOut(
        app_env=APP_ENV,
        is_prod=IS_PROD,
        worker_enabled=worker_enabled,
        session_cookie_secure=IS_PROD,
        magic_link_log_fallback_enabled=MAGIC_LINK_ALLOW_LOG_FALLBACK,
        integration_signing_secret_configured=integration_secret_configured,
        integration_signature_mode=signature_mode,
        integration_signature_max_age_seconds=signature_max_age_seconds,
        private_engine_configured=bool(private_engine.get("configured", False)),
        notes=notes,
    )


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
        code = 503 if detail and detail.startswith("Service unavailable") else 429
        raise HTTPException(status_code=code, detail=detail)

    existing = (
        await db.execute(select(Waitlist).where(func.lower(Waitlist.email) == email).limit(1))
    ).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="You're already on the waitlist. We'll email you when your spot is ready.",
        )

    db.add(
        Waitlist(
            email=email,
            name=(payload.name or "").strip() or None,
            company=(payload.company or "").strip() or None,
            use_case=(payload.use_case or "").strip() or None,
        )
    )
    await db.commit()
    return WaitlistJoinOut(status="ok", detail="You're on the list — we'll reach out when your spot is ready.")


# ---------------------------------------------------------------------------
# Waitlist — admin management
# ---------------------------------------------------------------------------

@router.get("/admin/waitlist", response_model=list[AdminWaitlistOut])
async def list_waitlist(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, pattern="^(pending|approved|rejected)$"),
    email_q: str | None = Query(default=None, min_length=1, max_length=255),
    db: AsyncSession = Depends(get_db),
) -> list[AdminWaitlistOut]:
    _require_admin_auth(request)

    stmt = select(Waitlist)
    if status:
        stmt = stmt.where(Waitlist.status == status)
    if email_q:
        stmt = stmt.where(func.lower(Waitlist.email).like(f"%{email_q.strip().lower()}%"))
    rows = (
        await db.execute(
            stmt
            .order_by(Waitlist.created_at.desc(), Waitlist.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [
        AdminWaitlistOut(
            id=w.id,
            email=w.email,
            name=w.name,
            company=w.company,
            use_case=w.use_case,
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
    auth_user_id = _require_admin_auth(request)

    entry = (
        await db.execute(select(Waitlist).where(Waitlist.id == entry_id).limit(1))
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    if entry.status == "approved":
        raise HTTPException(status_code=409, detail="Entry is already approved")

    now = now_utc()
    existing_user = (
        await db.execute(select(AuthUser).where(func.lower(AuthUser.email) == entry.email).limit(1))
    ).scalar_one_or_none()
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="User already registered; no invite needed")

    existing_active_invite = (
        await db.execute(
            select(AuthInvite)
            .where(func.lower(AuthInvite.email) == entry.email)
            .where(AuthInvite.revoked_at.is_(None))
            .where(AuthInvite.accepted_at.is_(None))
            .where(AuthInvite.expires_at > now)
            .order_by(AuthInvite.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing_active_invite is not None:
        raise HTTPException(status_code=409, detail="Active invite already exists for this email")

    # Create invite
    invite = AuthInvite(
        email=entry.email,
        invited_by_user_id=auth_user_id,
        expires_at=now + timedelta(days=INVITE_TTL_DAYS),
        notes=f"Approved from waitlist (entry #{entry.id})",
    )
    db.add(invite)
    entry.status = "approved"
    entry.reviewed_at = now
    entry.reviewed_by_admin_id = auth_user_id
    await db.flush()
    await _write_admin_audit(
        db,
        request,
        action="admin.waitlist.approve",
        entity_type="waitlist",
        entity_id=entry.id,
        metadata={"email": entry.email, "invite_id": invite.id},
    )

    sent, _send_status = send_invite_email(entry.email)
    if not sent:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Invite email delivery failed. Waitlist entry was not approved. Check SES/Resend configuration.",
        )

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
    auth_user_id = _require_admin_auth(request)

    entry = (
        await db.execute(select(Waitlist).where(Waitlist.id == entry_id).limit(1))
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    now = now_utc()
    entry.status = "rejected"
    entry.reviewed_at = now
    entry.reviewed_by_admin_id = auth_user_id
    await _write_admin_audit(
        db,
        request,
        action="admin.waitlist.reject",
        entity_type="waitlist",
        entity_id=entry.id,
        metadata={"email": entry.email},
    )

    sent, _send_status = send_waitlist_rejection_email(entry.email)
    if not sent:
        failure_note = "Rejection email delivery failed; entry remains rejected."
        entry.notes = f"{entry.notes}\n{failure_note}" if entry.notes else failure_note

    await db.commit()
    if not sent:
        return {
            "status": "ok",
            "email_sent": False,
            "detail": "Entry rejected and stored, but rejection email delivery failed.",
        }
    return {"status": "ok", "email_sent": True}
