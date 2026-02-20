from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import date as _today_date
from datetime import datetime, timedelta, timezone
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .analyzer.algorithm import (
    HybridRecallConfig,
    compute_embedding,
    fetch_memories_by_ids,
    run_hybrid_rag_recall,
)
from .analyzer.cag import maybe_answer_from_cache
from .db import AsyncSessionLocal, generate_api_key, get_db, hash_api_key
from .billing import emit_usage_event
from .models import (
    ApiKey,
    AuditLog,
    AuthUser,
    Membership,
    Memory,
    MemoryTag,
    Organization,
    Project,
    RecallLog,
    RecallTiming,
    Tag,
    UsageCounter,
    UsageEvent,
    UsagePeriod,
    User,
)
from .recall import build_memory_pack
from .rate_limit import check_recall_limits, get_counter, incr_counter
from .schemas import (
    ApiKeyCreate,
    ApiKeyCreatedOut,
    ApiKeyOut,
    AuditLogOut,
    MemoryCaptureIn,
    MemoryCreate,
    MemoryOut,
    MeOut,
    MembershipCreate,
    MembershipOut,
    OrgCreate,
    OrgOut,
    ProjectCreate,
    ProjectOut,
    RecallItemOut,
    RecallOut,
    RoleType,
    SearchOut,
    UsageLimitsOut,
    UsageOut,
)

# ── Daily usage limits (env-configurable, 0 = no limit) ─────────────────────
def _env_int(primary: str, fallback: str, default: str) -> int:
    raw = os.getenv(primary, "").strip() or os.getenv(fallback, "").strip() or default
    return int(raw)


DAILY_MEMORY_LIMIT  = _env_int("DAILY_MAX_MEMORIES", "DAILY_MEMORY_LIMIT", "100")
DAILY_RECALL_LIMIT  = _env_int("DAILY_MAX_RECALLS", "DAILY_RECALL_LIMIT", "50")
DAILY_PROJECT_LIMIT = _env_int("DAILY_MAX_PROJECTS", "DAILY_PROJECT_LIMIT", "10")
WEEKLY_MEMORY_LIMIT = int(os.getenv("WEEKLY_MAX_MEMORIES", "0"))
WEEKLY_RECALL_LIMIT = int(os.getenv("WEEKLY_MAX_RECALLS", "0"))
WEEKLY_PROJECT_LIMIT = int(os.getenv("WEEKLY_MAX_PROJECTS", "0"))
RECALL_WEIGHT_FTS = float(os.getenv("FTS_WEIGHT", os.getenv("RECALL_WEIGHT_FTS", "0.65")))
RECALL_WEIGHT_VECTOR = float(os.getenv("VECTOR_WEIGHT", os.getenv("RECALL_WEIGHT_VECTOR", "0.25")))
RECALL_WEIGHT_RECENCY = float(os.getenv("RECENCY_WEIGHT", os.getenv("RECALL_WEIGHT_RECENCY", "0.10")))
RECALL_VECTOR_MIN_SCORE = float(os.getenv("RECALL_VECTOR_MIN_SCORE", "0.20"))
RECALL_VECTOR_CANDIDATES = int(os.getenv("RECALL_VECTOR_CANDIDATES", "200"))
HEDGE_DELAY_MS = int(os.getenv("HEDGE_DELAY_MS", "120"))
HEDGE_MIN_DELAY_MS = int(os.getenv("HEDGE_MIN_DELAY_MS", "25"))
HEDGE_USE_P95 = os.getenv("HEDGE_USE_P95", "true").strip().lower() == "true"

router = APIRouter()

ROLE_RANK: dict[str, int] = {"viewer": 1, "member": 2, "admin": 3, "owner": 4}


@dataclass(frozen=True)
class RequestContext:
    api_key_id: int | None
    org_id: int | None
    role: RoleType | None
    actor_user_id: int | None
    actor_email: str | None
    api_key_prefix: str | None
    bootstrap_mode: bool


def get_request_context(request: Request) -> RequestContext:
    if not hasattr(request.state, "bootstrap_mode"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return RequestContext(
        api_key_id=getattr(request.state, "api_key_id", None),
        org_id=request.state.org_id,
        role=request.state.role,
        actor_user_id=request.state.actor_user_id,
        actor_email=request.state.actor_email,
        api_key_prefix=request.state.api_key_prefix,
        bootstrap_mode=request.state.bootstrap_mode,
    )


def get_actor_context(request: Request) -> RequestContext:
    return get_request_context(request)


def require_role(ctx: RequestContext, minimum: RoleType) -> None:
    if ctx.role is None:
        raise HTTPException(status_code=403, detail="No membership for this org")
    if ROLE_RANK[ctx.role] < ROLE_RANK[minimum]:
        raise HTTPException(status_code=403, detail="Forbidden")


def ensure_org_access(ctx: RequestContext, org_id: int) -> None:
    if ctx.bootstrap_mode:
        if ctx.org_id is not None and ctx.org_id != org_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        return
    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    if ctx.org_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")


async def write_audit(
    db: AsyncSession,
    *,
    ctx: RequestContext,
    org_id: int,
    action: str,
    entity_type: str,
    entity_id: int,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            org_id=org_id,
            actor_user_id=ctx.actor_user_id,
            api_key_prefix=ctx.api_key_prefix,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata or {},
        )
    )


def _ip_prefix_from_request(request: Request) -> str | None:
    # Trust Cloudflare's canonical client IP header when present.
    raw_ip = request.headers.get("cf-connecting-ip", "").strip()
    if not raw_ip:
        raw_ip = request.client.host if request.client else ""
    if not raw_ip:
        return None
    if ":" in raw_ip:
        parts = raw_ip.split(":")
        return ":".join(parts[:4]) + "::/64"
    parts = raw_ip.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3]) + ".0/24"
    return raw_ip


async def write_usage(
    db: AsyncSession,
    *,
    request: Request,
    ctx: RequestContext,
    event_type: str,
    org_id: int | None = None,
    project_id: int | None = None,
) -> None:
    db.add(
        UsageEvent(
            user_id=getattr(request.state, "auth_user_id", None),
            event_type=event_type,
            ip_prefix=_ip_prefix_from_request(request),
            project_id=project_id,
            org_id=org_id,
        )
    )


async def _get_usage_counter(db: AsyncSession, auth_user_id: int) -> UsageCounter | None:
    """Return today's UsageCounter for auth_user_id, or None if no row yet."""
    return (
        await db.execute(
            select(UsageCounter)
            .where(UsageCounter.user_id == auth_user_id, UsageCounter.day == _today_date.today())
            .limit(1)
        )
    ).scalar_one_or_none()


def _weekly_anchor(today: _today_date) -> _today_date:
    return today - timedelta(days=today.weekday())


def _redis_usage_key(auth_user_id: int, field: str, period: str, anchor: _today_date) -> str:
    return f"usage:{period}:{anchor.isoformat()}:user:{auth_user_id}:{field}"


def _period_ttl_seconds(period: str) -> int:
    return 86400 * (8 if period == "week" else 2)


def _period_limit_for_field(field: str, period: str) -> int:
    if period == "week":
        if field == "memories_created":
            return WEEKLY_MEMORY_LIMIT
        if field == "recall_queries":
            return WEEKLY_RECALL_LIMIT
        if field == "projects_created":
            return WEEKLY_PROJECT_LIMIT
        return 0
    if field == "memories_created":
        return DAILY_MEMORY_LIMIT
    if field == "recall_queries":
        return DAILY_RECALL_LIMIT
    if field == "projects_created":
        return DAILY_PROJECT_LIMIT
    return 0


async def _check_daily_limit(db: AsyncSession, auth_user_id: int | None, field: str, limit: int) -> None:
    """Raise HTTP 429 if the user has hit their daily limit for *field*.

    Skips the check when:
    - auth_user_id is None (API-key-only calls, no auth user)
    - limit <= 0 (disabled globally)
    - auth_user.is_unlimited is True (per-user bypass)
    """
    if auth_user_id is None or limit <= 0:
        return
    # Per-user bypass check (one extra query, fine at alpha scale)
    au = (await db.execute(select(AuthUser).where(AuthUser.id == auth_user_id).limit(1))).scalar_one_or_none()
    if au is not None and au.is_unlimited:
        return
    counter = await _get_usage_counter(db, auth_user_id)
    if counter is not None:
        current = getattr(counter, field, 0) or 0
        if current >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit reached ({limit}). Resets at midnight UTC.",
            )
    # Redis-backed distributed counters (day + week).
    today = _today_date.today()
    for period, anchor in (("day", today), ("week", _weekly_anchor(today))):
        period_limit = _period_limit_for_field(field, period)
        if period_limit <= 0:
            continue
        current = get_counter(_redis_usage_key(auth_user_id, field, period, anchor))
        if current >= period_limit:
            period_label = "Daily" if period == "day" else "Weekly"
            raise HTTPException(status_code=429, detail=f"{period_label} limit reached ({period_limit}).")


async def _increment_daily_counter(db: AsyncSession, auth_user_id: int | None, field: str) -> None:
    """Atomically increment a daily counter field for auth_user_id (upsert).

    Uses PostgreSQL INSERT … ON CONFLICT DO UPDATE for a single round-trip.
    Safe under concurrent requests — no read-modify-write race.
    """
    if auth_user_id is None:
        return
    today = _today_date.today()
    # Build the upsert: insert a row with count=1; if it already exists for
    # (user_id, day), increment the target column by 1.
    stmt = (
        pg_insert(UsageCounter)
        .values(user_id=auth_user_id, day=today, **{field: 1})
        .on_conflict_do_update(
            index_elements=["user_id", "day"],
            set_={field: UsageCounter.__table__.c[field] + 1},
        )
    )
    await db.execute(stmt)

    today = _today_date.today()
    for period, anchor in (("day", today), ("week", _weekly_anchor(today))):
        period_limit = _period_limit_for_field(field, period)
        if period_limit <= 0:
            continue
        count = incr_counter(_redis_usage_key(auth_user_id, field, period, anchor), _period_ttl_seconds(period))
        if count > period_limit:
            period_label = "Daily" if period == "day" else "Weekly"
            raise HTTPException(status_code=429, detail=f"{period_label} limit reached ({period_limit}).")


async def _increment_usage_period(db: AsyncSession, auth_user_id: int | None, field: str, amount: int = 1) -> None:
    if auth_user_id is None:
        return
    now = datetime.now(timezone.utc)
    period_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    next_month = datetime(now.year + (1 if now.month == 12 else 0), 1 if now.month == 12 else now.month + 1, 1, tzinfo=timezone.utc)
    period_end = next_month - timedelta(seconds=1)
    period = (
        await db.execute(
            select(UsagePeriod).where(
                UsagePeriod.user_id == auth_user_id,
                UsagePeriod.period_start == period_start,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if period is None:
        period = UsagePeriod(
            user_id=auth_user_id,
            period_start=period_start,
            period_end=period_end,
            memories_created=0,
            search_queries=0,
            bytes_ingested=0,
        )
        db.add(period)
        await db.flush()
    if field == "memories_created":
        period.memories_created = int(period.memories_created or 0) + amount
    elif field in {"recall_queries", "search_queries"}:
        period.search_queries = int(period.search_queries or 0) + amount


def _billing_hook(event_type: str, user_id: int | None) -> None:
    emit_usage_event(event_type=event_type, user_id=user_id)


async def get_org_or_404(db: AsyncSession, org_id: int) -> Organization:
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id).limit(1))
    ).scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    return org


async def get_project_or_404(db: AsyncSession, project_id: int, ctx: RequestContext) -> Project:
    if ctx.org_id is None and not ctx.bootstrap_mode:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    project_query = select(Project).where(Project.id == project_id)
    if ctx.org_id is not None:
        project_query = project_query.where(Project.org_id == ctx.org_id)
    project = (await db.execute(project_query.limit(1))).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not ctx.bootstrap_mode and ctx.org_id is not None and project.org_id != ctx.org_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/me", response_model=MeOut)
async def get_me(ctx: RequestContext = Depends(get_actor_context)) -> MeOut:
    return MeOut(
        org_id=ctx.org_id,
        role=ctx.role,
        api_key_prefix=ctx.api_key_prefix,
        actor_user_id=ctx.actor_user_id,
    )


@router.get("/me/usage", response_model=UsageOut)
async def get_my_usage(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UsageOut:
    """Return today's usage counters + configured limits for the current user."""
    auth_user_id: int | None = getattr(request.state, "auth_user_id", None)
    if auth_user_id is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    counter = await _get_usage_counter(db, auth_user_id)
    today = _today_date.today()
    week_anchor = _weekly_anchor(today)
    return UsageOut(
        day=today.isoformat(),
        memories_created=counter.memories_created if counter else 0,
        recall_queries=counter.recall_queries if counter else 0,
        projects_created=counter.projects_created if counter else 0,
        week_start=week_anchor.isoformat(),
        weekly_memories_created=get_counter(_redis_usage_key(auth_user_id, "memories_created", "week", week_anchor)),
        weekly_recall_queries=get_counter(_redis_usage_key(auth_user_id, "recall_queries", "week", week_anchor)),
        weekly_projects_created=get_counter(_redis_usage_key(auth_user_id, "projects_created", "week", week_anchor)),
        limits=UsageLimitsOut(
            memories_per_day=DAILY_MEMORY_LIMIT,
            recalls_per_day=DAILY_RECALL_LIMIT,
            projects_per_day=DAILY_PROJECT_LIMIT,
            memories_per_week=WEEKLY_MEMORY_LIMIT,
            recalls_per_week=WEEKLY_RECALL_LIMIT,
            projects_per_week=WEEKLY_PROJECT_LIMIT,
        ),
    )


@router.post("/orgs", response_model=OrgOut, status_code=201)
async def create_org(
    payload: OrgCreate,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> OrgOut:
    org_count = (await db.execute(select(func.count(Organization.id)))).scalar_one()
    if org_count > 0:
        require_role(ctx, "admin")

    org = Organization(name=payload.name)
    db.add(org)
    await db.flush()

    bootstrap_actor_user_id = ctx.actor_user_id
    if org_count == 0 and bootstrap_actor_user_id is None:
        bootstrap_email = (ctx.actor_email or "bootstrap@local").strip().lower()
        bootstrap_user = (
            await db.execute(select(User).where(func.lower(User.email) == bootstrap_email).limit(1))
        ).scalar_one_or_none()
        if bootstrap_user is None:
            bootstrap_user = User(email=bootstrap_email, display_name="Bootstrap Owner")
            db.add(bootstrap_user)
            await db.flush()
        bootstrap_actor_user_id = bootstrap_user.id

    if bootstrap_actor_user_id is not None:
        existing_membership = (
            await db.execute(
                select(Membership.id)
                .where(Membership.org_id == org.id, Membership.user_id == bootstrap_actor_user_id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing_membership is None:
            db.add(Membership(org_id=org.id, user_id=bootstrap_actor_user_id, role="owner"))

    await write_audit(
        db,
        ctx=ctx,
        org_id=org.id,
        action="org.create",
        entity_type="org",
        entity_id=org.id,
        metadata={"name": org.name},
    )
    await db.commit()
    await db.refresh(org)
    return OrgOut(id=org.id, name=org.name, created_at=org.created_at)


@router.get("/orgs", response_model=List[OrgOut])
async def list_orgs(
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[OrgOut]:
    if ctx.bootstrap_mode:
        rows = (await db.execute(select(Organization).order_by(Organization.id.desc()))).scalars().all()
    elif ctx.org_id is not None:
        rows = (
            await db.execute(
                select(Organization).where(Organization.id == ctx.org_id).order_by(Organization.id.desc())
            )
        ).scalars().all()
    else:
        rows = []
    return [OrgOut(id=o.id, name=o.name, created_at=o.created_at) for o in rows]


@router.post("/orgs/{org_id}/memberships", response_model=MembershipOut, status_code=201)
async def create_membership(
    org_id: int,
    payload: MembershipCreate,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> MembershipOut:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "owner")
    await get_org_or_404(db, org_id)

    user = (
        await db.execute(select(User).where(func.lower(User.email) == payload.email.strip().lower()).limit(1))
    ).scalar_one_or_none()
    if user is None:
        user = User(email=payload.email.strip().lower(), display_name=payload.display_name)
        db.add(user)
        await db.flush()
    elif payload.display_name and not user.display_name:
        user.display_name = payload.display_name

    membership = (
        await db.execute(
            select(Membership).where(Membership.org_id == org_id, Membership.user_id == user.id).limit(1)
        )
    ).scalar_one_or_none()
    if membership is None:
        membership = Membership(org_id=org_id, user_id=user.id, role=payload.role)
        db.add(membership)
        await db.flush()
    else:
        membership.role = payload.role

    await write_audit(
        db,
        ctx=ctx,
        org_id=org_id,
        action="membership.upsert",
        entity_type="membership",
        entity_id=membership.id,
        metadata={"email": user.email, "role": membership.role},
    )
    await db.commit()
    await db.refresh(membership)
    return MembershipOut(
        id=membership.id,
        org_id=membership.org_id,
        user_id=membership.user_id,
        email=user.email,
        display_name=user.display_name,
        role=membership.role,
        created_at=membership.created_at,
    )


@router.get("/orgs/{org_id}/memberships", response_model=List[MembershipOut])
async def list_memberships(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[MembershipOut]:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "owner")
    await get_org_or_404(db, org_id)

    rows = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.org_id == org_id)
            .order_by(Membership.id.asc())
        )
    ).all()
    return [
        MembershipOut(
            id=membership.id,
            org_id=membership.org_id,
            user_id=membership.user_id,
            email=user.email,
            display_name=user.display_name,
            role=membership.role,
            created_at=membership.created_at,
        )
        for membership, user in rows
    ]


@router.get("/orgs/{org_id}/audit-logs", response_model=List[AuditLogOut])
async def list_audit_logs(
    org_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[AuditLogOut]:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "owner")
    await get_org_or_404(db, org_id)

    logs = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.org_id == org_id)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        AuditLogOut(
            id=log.id,
            org_id=log.org_id,
            actor_user_id=log.actor_user_id,
            api_key_prefix=log.api_key_prefix,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            metadata=log.metadata_json,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.post("/orgs/{org_id}/projects", response_model=ProjectOut, status_code=201)
async def create_org_project(
    org_id: int,
    payload: ProjectCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> ProjectOut:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "member")
    await get_org_or_404(db, org_id)

    auth_user_id: int | None = getattr(request.state, "auth_user_id", None)
    await _check_daily_limit(db, auth_user_id, "projects_created", DAILY_PROJECT_LIMIT)

    project = Project(name=payload.name, org_id=org_id, created_by_user_id=ctx.actor_user_id)
    db.add(project)
    await db.flush()
    await write_audit(
        db,
        ctx=ctx,
        org_id=org_id,
        action="project.create",
        entity_type="project",
        entity_id=project.id,
        metadata={"name": project.name},
    )
    await write_usage(db, request=request, ctx=ctx, event_type="project_created", org_id=org_id, project_id=project.id)
    await _increment_daily_counter(db, auth_user_id, "projects_created")
    await _increment_usage_period(db, auth_user_id, "projects_created")
    _billing_hook("project_created", auth_user_id)
    await db.commit()
    await db.refresh(project)
    return ProjectOut(
        id=project.id,
        org_id=project.org_id,
        created_by_user_id=project.created_by_user_id,
        name=project.name,
        created_at=project.created_at,
    )


@router.get("/orgs/{org_id}/projects", response_model=List[ProjectOut])
async def list_org_projects(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[ProjectOut]:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "viewer")
    await get_org_or_404(db, org_id)

    rows = (
        await db.execute(select(Project).where(Project.org_id == org_id).order_by(Project.id.desc()))
    ).scalars().all()
    return [
        ProjectOut(
            id=p.id,
            org_id=p.org_id,
            created_by_user_id=p.created_by_user_id,
            name=p.name,
            created_at=p.created_at,
        )
        for p in rows
    ]


@router.post("/orgs/{org_id}/api-keys", response_model=ApiKeyCreatedOut, status_code=201)
async def create_org_api_key(
    org_id: int,
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> ApiKeyCreatedOut:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "admin")
    await get_org_or_404(db, org_id)

    plaintext = generate_api_key()
    prefix = plaintext[:8]
    key = ApiKey(
        org_id=org_id,
        name=payload.name,
        key_hash=hash_api_key(plaintext),
        prefix=prefix,
    )
    db.add(key)
    await db.flush()
    await write_audit(
        db,
        ctx=ctx,
        org_id=org_id,
        action="api_key.create",
        entity_type="api_key",
        entity_id=key.id,
        metadata={"name": key.name, "prefix": key.prefix},
    )
    await db.commit()
    await db.refresh(key)
    return ApiKeyCreatedOut(
        id=key.id,
        org_id=key.org_id,
        name=key.name,
        prefix=key.prefix,
        created_at=key.created_at,
        revoked_at=key.revoked_at,
        api_key=plaintext,
    )


@router.get("/orgs/{org_id}/api-keys", response_model=List[ApiKeyOut])
async def list_org_api_keys(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[ApiKeyOut]:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "admin")
    await get_org_or_404(db, org_id)

    keys = (
        await db.execute(
            select(ApiKey).where(ApiKey.org_id == org_id).order_by(ApiKey.created_at.desc(), ApiKey.id.desc())
        )
    ).scalars().all()
    return [
        ApiKeyOut(
            id=k.id,
            org_id=k.org_id,
            name=k.name,
            prefix=k.prefix,
            created_at=k.created_at,
            revoked_at=k.revoked_at,
        )
        for k in keys
    ]


@router.post("/orgs/{org_id}/api-keys/{key_id}/revoke", response_model=ApiKeyOut)
async def revoke_org_api_key(
    org_id: int,
    key_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> ApiKeyOut:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "admin")
    await get_org_or_404(db, org_id)

    key = (
        await db.execute(
            select(ApiKey).where(ApiKey.org_id == org_id, ApiKey.id == key_id).limit(1)
        )
    ).scalar_one_or_none()
    if key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        await write_audit(
            db,
            ctx=ctx,
            org_id=org_id,
            action="api_key.revoke",
            entity_type="api_key",
            entity_id=key.id,
            metadata={"prefix": key.prefix},
        )
        await db.commit()
        await db.refresh(key)

    return ApiKeyOut(
        id=key.id,
        org_id=key.org_id,
        name=key.name,
        prefix=key.prefix,
        created_at=key.created_at,
        revoked_at=key.revoked_at,
    )


# Legacy endpoints kept for compatibility; all are org-scoped by request context.
@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> ProjectOut:
    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    return await create_org_project(org_id=ctx.org_id, payload=payload, request=request, db=db, ctx=ctx)


@router.get("/projects", response_model=List[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[ProjectOut]:
    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    return await list_org_projects(org_id=ctx.org_id, db=db, ctx=ctx)


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


async def _load_tag_names(db: AsyncSession, memory_ids: list[int]) -> dict[int, list[str]]:
    """Load tag names for a list of memory IDs. Returns {memory_id: [tag_name, ...]}."""
    if not memory_ids:
        return {}
    rows = (
        await db.execute(
            select(MemoryTag.memory_id, Tag.name)
            .join(Tag, Tag.id == MemoryTag.tag_id)
            .where(MemoryTag.memory_id.in_(memory_ids))
            .order_by(Tag.name)
        )
    ).all()
    result: dict[int, list[str]] = {mid: [] for mid in memory_ids}
    for memory_id, tag_name in rows:
        result[memory_id].append(tag_name)
    return result


async def _upsert_tags(db: AsyncSession, project_id: int, tag_names: list[str]) -> list[Tag]:
    """Return Tag objects for the given names, creating any that don't exist."""
    clean = [n.strip().lower()[:100] for n in tag_names if n.strip()][:20]
    tags: list[Tag] = []
    for name in clean:
        tag = (
            await db.execute(
                select(Tag)
                .where(Tag.project_id == project_id, func.lower(Tag.name) == name)
                .limit(1)
            )
        ).scalar_one_or_none()
        if tag is None:
            tag = Tag(project_id=project_id, name=name)
            db.add(tag)
            await db.flush()
        tags.append(tag)
    return tags


def _memory_to_out(m: Memory, tag_names: list[str]) -> MemoryOut:
    return MemoryOut(
        id=m.id,
        project_id=m.project_id,
        created_by_user_id=m.created_by_user_id,
        type=m.type,
        source=m.source,
        title=m.title,
        content=m.content,
        metadata=m.metadata_json or {},
        tags=tag_names,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _recall_item_to_out(m: Memory, tag_names: list[str], rank_score: float | None) -> RecallItemOut:
    return RecallItemOut(
        id=m.id,
        project_id=m.project_id,
        created_by_user_id=m.created_by_user_id,
        type=m.type,
        source=m.source,
        title=m.title,
        content=m.content,
        metadata=m.metadata_json or {},
        tags=tag_names,
        created_at=m.created_at,
        updated_at=m.updated_at,
        rank_score=rank_score,
    )


def _extract_client_ip(request: Request) -> str:
    return request.headers.get("cf-connecting-ip", "").strip() or (request.client.host if request.client else "unknown")


def _check_integration_signature(request: Request, body_bytes: bytes) -> None:
    secret = os.getenv("INTEGRATION_SIGNING_SECRET", "").strip()
    if not secret:
        return
    provided = request.headers.get("x-integration-signature", "").strip()
    if not provided:
        raise HTTPException(status_code=401, detail="Missing integration signature")
    provided_hash = provided.split("=", 1)[1] if provided.startswith("sha256=") else provided
    expected_hash = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(provided_hash, expected_hash):
        raise HTTPException(status_code=401, detail="Invalid integration signature")


async def _write_recall_log(
    db: AsyncSession,
    *,
    project: Project,
    ctx: RequestContext,
    strategy: str,
    query_text: str,
    input_memory_ids: list[int],
    ranked_memory_ids: list[int],
    weights: dict[str, float] | None = None,
    score_details: dict[str, Any] | None = None,
) -> None:
    db.add(
        RecallLog(
            org_id=project.org_id,
            project_id=project.id,
            actor_user_id=ctx.actor_user_id,
            strategy=strategy,
            query_text=query_text,
            input_memory_ids=input_memory_ids,
            ranked_memory_ids=ranked_memory_ids,
            weights_json=weights or {},
            score_details_json=score_details or {},
        )
    )


async def _write_recall_timing(
    db: AsyncSession,
    *,
    project: Project,
    ctx: RequestContext,
    served_by: str,
    strategy: str,
    hedge_delay_ms: int,
    cag_duration_ms: int | None,
    rag_duration_ms: int | None,
    total_duration_ms: int,
) -> None:
    db.add(
        RecallTiming(
            org_id=project.org_id,
            project_id=project.id,
            actor_user_id=ctx.actor_user_id,
            served_by=served_by,
            strategy=strategy,
            hedge_delay_ms=hedge_delay_ms,
            cag_duration_ms=cag_duration_ms,
            rag_duration_ms=rag_duration_ms,
            total_duration_ms=total_duration_ms,
        )
    )


async def _resolve_hedge_delay_ms(db: AsyncSession, org_id: int) -> int:
    if not HEDGE_USE_P95:
        return max(HEDGE_MIN_DELAY_MS, HEDGE_DELAY_MS)
    p95 = (
        await db.execute(
            select(func.percentile_cont(0.95).within_group(RecallTiming.cag_duration_ms))
            .where(
                RecallTiming.org_id == org_id,
                RecallTiming.cag_duration_ms.is_not(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if p95 is None:
        return max(HEDGE_MIN_DELAY_MS, HEDGE_DELAY_MS)
    try:
        return max(HEDGE_MIN_DELAY_MS, int(float(p95)))
    except (TypeError, ValueError):
        return max(HEDGE_MIN_DELAY_MS, HEDGE_DELAY_MS)


async def _timed_cag_lookup(query_text: str) -> tuple[Any, int]:
    loop = asyncio.get_running_loop()
    started = loop.time()
    answer = await asyncio.to_thread(maybe_answer_from_cache, query_text)
    elapsed = int((loop.time() - started) * 1000)
    return answer, elapsed


async def _run_rag_recall_with_timing(
    *,
    db: AsyncSession,
    project_id: int,
    query_text: str,
    limit: int,
) -> tuple[dict[str, Any], int]:
    loop = asyncio.get_running_loop()
    started = loop.time()
    result = await run_hybrid_rag_recall(
        db,
        project_id=project_id,
        query_text=query_text,
        limit=limit,
        config=HybridRecallConfig(
            fts_weight=RECALL_WEIGHT_FTS,
            vector_weight=RECALL_WEIGHT_VECTOR,
            recency_weight=RECALL_WEIGHT_RECENCY,
            vector_min_score=RECALL_VECTOR_MIN_SCORE,
            vector_candidates=RECALL_VECTOR_CANDIDATES,
        ),
    )
    elapsed = int((loop.time() - started) * 1000)
    return result, elapsed


async def _run_rag_recall(
    *,
    project_id: int,
    query_text: str,
    limit: int,
) -> tuple[dict[str, Any], int]:
    async with AsyncSessionLocal() as rag_db:
        return await _run_rag_recall_with_timing(
            db=rag_db,
            project_id=project_id,
            query_text=query_text,
            limit=limit,
        )


@router.post("/projects/{project_id}/memories", response_model=MemoryOut, status_code=201)
async def create_memory(
    project_id: int,
    payload: MemoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> MemoryOut:
    require_role(ctx, "member")
    project = await get_project_or_404(db, project_id, ctx)

    auth_user_id: int | None = getattr(request.state, "auth_user_id", None)
    await _check_daily_limit(db, auth_user_id, "memories_created", DAILY_MEMORY_LIMIT)

    embedding = compute_embedding(
        " ".join(part for part in [payload.title or "", payload.content or ""] if part).strip()
    )
    memory = Memory(
        project_id=project.id,
        created_by_user_id=ctx.actor_user_id,
        type=payload.type,
        source=payload.source,
        title=payload.title,
        content=payload.content,
        metadata_json=payload.metadata or {},
        content_hash=_content_hash(payload.content),
        search_vector=embedding,
        embedding_vector=embedding,
    )
    db.add(memory)
    await db.flush()

    # Upsert tags
    tag_names: list[str] = []
    if payload.tags:
        tags = await _upsert_tags(db, project.id, payload.tags)
        for tag in tags:
            db.add(MemoryTag(memory_id=memory.id, tag_id=tag.id))
        tag_names = [t.name for t in tags]

    await write_audit(
        db,
        ctx=ctx,
        org_id=project.org_id,
        action="memory.create",
        entity_type="memory",
        entity_id=memory.id,
        metadata={"type": memory.type, "source": memory.source},
    )
    await write_usage(
        db,
        request=request,
        ctx=ctx,
        event_type="memory_created",
        org_id=project.org_id,
        project_id=project.id,
    )
    await _increment_daily_counter(db, auth_user_id, "memories_created")
    await _increment_usage_period(db, auth_user_id, "memories_created")
    _billing_hook("memory_created", auth_user_id)
    await db.commit()
    await db.refresh(memory)

    # Fire-and-forget embedding task (no-op until WORKER_ENABLED=true + pgvector ready)
    from app.worker.tasks import compute_memory_embedding, _enqueue_if_enabled
    _enqueue_if_enabled(compute_memory_embedding, memory.id)

    return _memory_to_out(memory, tag_names)


@router.post("/integrations/memories", response_model=MemoryOut, status_code=201)
async def capture_memory(
    payload: MemoryCaptureIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> MemoryOut:
    """Integration-friendly memory ingestion endpoint.

    Same auth, RBAC, and usage limits as /projects/{project_id}/memories.
    """
    _check_integration_signature(request, await request.body())
    memory_payload = MemoryCreate(
        type=payload.type,
        source=payload.source,
        title=payload.title,
        content=payload.content,
        metadata=payload.metadata,
        tags=payload.tags,
    )
    return await create_memory(
        project_id=payload.project_id,
        payload=memory_payload,
        request=request,
        db=db,
        ctx=ctx,
    )


@router.get("/integrations/memories", response_model=List[MemoryOut])
async def list_integration_memories(
    project_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[MemoryOut]:
    require_role(ctx, "viewer")
    stmt = select(Memory)

    if project_id is not None:
        project = await get_project_or_404(db, project_id, ctx)
        stmt = stmt.where(Memory.project_id == project.id)
    else:
        if ctx.org_id is None:
            raise HTTPException(status_code=400, detail="X-Org-Id required")
        stmt = stmt.join(Project, Project.id == Memory.project_id).where(Project.org_id == ctx.org_id)

    items = (
        await db.execute(
            stmt
            .order_by(Memory.created_at.desc(), Memory.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    tag_map = await _load_tag_names(db, [m.id for m in items])
    return [_memory_to_out(m, tag_map.get(m.id, [])) for m in items]


@router.post("/integrations/memories/{memory_id}/contextualize")
async def contextualize_memory(
    memory_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> dict[str, Any]:
    require_role(ctx, "member")
    memory = (await db.execute(select(Memory).where(Memory.id == memory_id).limit(1))).scalar_one_or_none()
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    project = await get_project_or_404(db, memory.project_id, ctx)
    from app.worker.tasks import _enqueue_if_enabled, contextualize_memory_with_ollama
    _enqueue_if_enabled(contextualize_memory_with_ollama, memory.id)
    return {"status": "queued", "memory_id": memory.id, "project_id": project.id}


@router.get("/projects/{project_id}/memories", response_model=List[MemoryOut])
async def list_memories(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> List[MemoryOut]:
    require_role(ctx, "viewer")
    project = await get_project_or_404(db, project_id, ctx)
    items = (
        await db.execute(
            select(Memory)
            .where(Memory.project_id == project.id)
            .order_by(Memory.created_at.desc(), Memory.id.desc())
        )
    ).scalars().all()
    tag_map = await _load_tag_names(db, [m.id for m in items])
    return [_memory_to_out(m, tag_map.get(m.id, [])) for m in items]


@router.get("/projects/{project_id}/search", response_model=SearchOut)
async def search_memories(
    project_id: int,
    request: Request,
    q: str = Query(default="", description="Full-text search query"),
    type: str | None = Query(default=None),
    source: str | None = Query(default=None),
    tag: str | None = Query(default=None, description="Filter by tag name"),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> SearchOut:
    """FTS search with optional filters. Ranks by ts_rank_cd + recency boost."""
    require_role(ctx, "viewer")
    project = await get_project_or_404(db, project_id, ctx)

    query_clean = q.strip()
    stmt = select(Memory).where(Memory.project_id == project.id)

    if type:
        stmt = stmt.where(Memory.type == type)
    if source:
        stmt = stmt.where(Memory.source == source)
    if tag:
        tag_row = (
            await db.execute(
                select(Tag)
                .where(Tag.project_id == project.id, func.lower(Tag.name) == tag.lower())
                .limit(1)
            )
        ).scalar_one_or_none()
        if tag_row:
            stmt = stmt.join(MemoryTag, MemoryTag.memory_id == Memory.id).where(
                MemoryTag.tag_id == tag_row.id
            )
        else:
            # Tag doesn't exist → no results
            return SearchOut(project_id=project.id, query=query_clean, total=0, items=[])

    top_with_rank: list[tuple[Memory, float | None]] = []
    if query_clean:
        tsquery = func.websearch_to_tsquery("english", query_clean)
        rank_expr = func.ts_rank_cd(Memory.search_tsv, tsquery).label("rank_score")
        fts_stmt = (
            stmt.add_columns(rank_expr)
            .where(Memory.search_tsv.op("@@")(tsquery))
            .order_by(desc(rank_expr), Memory.created_at.desc(), Memory.id.desc())
            .limit(limit)
        )
        rows = (await db.execute(fts_stmt)).all()
        top_with_rank = [(row[0], float(row[1])) for row in rows]
    else:
        recent = (
            await db.execute(
                stmt.order_by(Memory.created_at.desc(), Memory.id.desc()).limit(limit)
            )
        ).scalars().all()
        top_with_rank = [(m, None) for m in recent]

    await write_usage(
        db, request=request, ctx=ctx,
        event_type="search_called", org_id=project.org_id, project_id=project.id,
    )
    await db.commit()

    tag_map = await _load_tag_names(db, [m.id for m, _ in top_with_rank])
    return SearchOut(
        project_id=project.id,
        query=query_clean,
        total=len(top_with_rank),
        items=[_recall_item_to_out(m, tag_map.get(m.id, []), rs) for m, rs in top_with_rank],
    )


@router.get("/projects/{project_id}/recall", response_model=RecallOut)
async def recall(
    project_id: int,
    request: Request,
    query: str = "",
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> RecallOut:
    require_role(ctx, "viewer")
    project = await get_project_or_404(db, project_id, ctx)
    client_ip = _extract_client_ip(request)
    account_key = str(getattr(request.state, "auth_user_id", "") or getattr(request.state, "api_key_id", "") or "anon")
    allowed, detail = check_recall_limits(client_ip, account_key)
    if not allowed:
        code = 503 if detail and detail.startswith("Service unavailable") else 429
        raise HTTPException(status_code=code, detail=detail)

    auth_user_id: int | None = getattr(request.state, "auth_user_id", None)
    await _check_daily_limit(db, auth_user_id, "recall_queries", DAILY_RECALL_LIMIT)

    query_clean = query.strip()
    loop = asyncio.get_running_loop()
    request_started = loop.time()
    top_with_rank: list[tuple[Memory, float | None]] = []
    strategy = "recency"
    served_by = "rag"
    input_memory_ids: list[int] = []
    ranked_memory_ids: list[int] = []
    score_details: dict[str, Any] = {}
    weight_details = {
        "fts": RECALL_WEIGHT_FTS,
        "vector": RECALL_WEIGHT_VECTOR,
        "recency": RECALL_WEIGHT_RECENCY,
    }
    hedge_delay_ms = 0
    cag_duration_ms: int | None = None
    rag_duration_ms: int | None = None
    cag_pack: str | None = None

    if query_clean:
        hedge_delay_ms = await _resolve_hedge_delay_ms(db, project.org_id)
        cag_task = asyncio.create_task(_timed_cag_lookup(query_clean))
        rag_task: asyncio.Task | None = None
        try:
            # Give CAG a head-start. If it answers quickly, we avoid launching RAG.
            done, _ = await asyncio.wait({cag_task}, timeout=hedge_delay_ms / 1000.0)
            if cag_task in done:
                cag_answer, cag_duration_ms = await cag_task
                if cag_answer is not None:
                    served_by = "cag"
                    strategy = "cag"
                    score_details = {
                        "source": cag_answer.source,
                        "score": cag_answer.score,
                        "snippets": len(cag_answer.snippets),
                    }
                    cag_pack = build_memory_pack(query_clean, [("doc", snippet) for snippet in cag_answer.snippets])
                else:
                    rag_result, rag_duration_ms = await _run_rag_recall(
                        project_id=project.id,
                        query_text=query_clean,
                        limit=limit,
                    )
                    served_by = "rag"
                    strategy = rag_result["strategy"]
                    input_memory_ids = rag_result["input_ids"]
                    ranked_memory_ids = rag_result["ranked_ids"]
                    score_details = rag_result["score_details"]
                    memories = await fetch_memories_by_ids(db, ranked_memory_ids)
                    score_by_id = rag_result["scores"]
                    top_with_rank = [(mem, score_by_id.get(mem.id)) for mem in memories]
            else:
                # CAG is slow: hedge by launching RAG and take the first useful result.
                rag_task = asyncio.create_task(
                    _run_rag_recall(project_id=project.id, query_text=query_clean, limit=limit)
                )
                done, _ = await asyncio.wait({cag_task, rag_task}, return_when=asyncio.FIRST_COMPLETED)
                if rag_task in done:
                    rag_result, rag_duration_ms = await rag_task
                    served_by = "rag"
                    strategy = rag_result["strategy"]
                    input_memory_ids = rag_result["input_ids"]
                    ranked_memory_ids = rag_result["ranked_ids"]
                    score_details = rag_result["score_details"]
                    memories = await fetch_memories_by_ids(db, ranked_memory_ids)
                    score_by_id = rag_result["scores"]
                    top_with_rank = [(mem, score_by_id.get(mem.id)) for mem in memories]
                    if not cag_task.done():
                        cag_task.cancel()
                        try:
                            await cag_task
                        except asyncio.CancelledError:
                            pass
                else:
                    cag_answer, cag_duration_ms = await cag_task
                    if cag_answer is not None:
                        served_by = "cag"
                        strategy = "cag"
                        score_details = {
                            "source": cag_answer.source,
                            "score": cag_answer.score,
                            "snippets": len(cag_answer.snippets),
                        }
                        cag_pack = build_memory_pack(query_clean, [("doc", snippet) for snippet in cag_answer.snippets])
                        if rag_task is not None and not rag_task.done():
                            rag_task.cancel()
                            try:
                                await rag_task
                            except asyncio.CancelledError:
                                pass
                    else:
                        if rag_task is None:
                            rag_task = asyncio.create_task(
                                _run_rag_recall(project_id=project.id, query_text=query_clean, limit=limit)
                            )
                        rag_result, rag_duration_ms = await rag_task
                        served_by = "rag"
                        strategy = rag_result["strategy"]
                        input_memory_ids = rag_result["input_ids"]
                        ranked_memory_ids = rag_result["ranked_ids"]
                        score_details = rag_result["score_details"]
                        memories = await fetch_memories_by_ids(db, ranked_memory_ids)
                        score_by_id = rag_result["scores"]
                        top_with_rank = [(mem, score_by_id.get(mem.id)) for mem in memories]
        finally:
            if not cag_task.done():
                cag_task.cancel()
                try:
                    await cag_task
                except asyncio.CancelledError:
                    pass
            if rag_task is not None and not rag_task.done():
                rag_task.cancel()
                try:
                    await rag_task
                except asyncio.CancelledError:
                    pass
    else:
        rag_started = loop.time()
        recent_result = await db.execute(
            select(Memory)
            .where(Memory.project_id == project.id)
            .order_by(Memory.created_at.desc(), Memory.id.desc())
            .limit(limit)
        )
        top_with_rank = [(m, None) for m in recent_result.scalars().all()]
        ranked_memory_ids = [m.id for m, _ in top_with_rank]
        score_details = {"reason": "empty_query"}
        rag_duration_ms = int((loop.time() - rag_started) * 1000)

    if cag_pack is None:
        pack = build_memory_pack(query_clean, [(m.type, m.content) for m, _ in top_with_rank])
    else:
        pack = cag_pack

    total_duration_ms = int((loop.time() - request_started) * 1000)
    await write_usage(
        db,
        request=request,
        ctx=ctx,
        event_type="recall_called",
        org_id=project.org_id,
        project_id=project.id,
    )
    await _increment_daily_counter(db, auth_user_id, "recall_queries")
    await _increment_usage_period(db, auth_user_id, "recall_queries")
    _billing_hook("recall_called", auth_user_id)
    await _write_recall_log(
        db,
        project=project,
        ctx=ctx,
        strategy=strategy,
        query_text=query_clean,
        input_memory_ids=input_memory_ids,
        ranked_memory_ids=ranked_memory_ids,
        weights=weight_details if query_clean else {},
        score_details=score_details,
    )
    await _write_recall_timing(
        db,
        project=project,
        ctx=ctx,
        served_by=served_by,
        strategy=strategy,
        hedge_delay_ms=hedge_delay_ms,
        cag_duration_ms=cag_duration_ms,
        rag_duration_ms=rag_duration_ms,
        total_duration_ms=total_duration_ms,
    )
    await db.commit()

    tag_map = await _load_tag_names(db, [m.id for m, _ in top_with_rank]) if top_with_rank else {}
    out_items = [_recall_item_to_out(m, tag_map.get(m.id, []), rs) for m, rs in top_with_rank]
    return RecallOut(
        project_id=project.id,
        query=query_clean,
        memory_pack_text=pack,
        items=out_items,
    )
