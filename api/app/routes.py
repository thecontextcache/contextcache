from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import date as _today_date
from datetime import datetime, timezone
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .db import generate_api_key, get_db, hash_api_key
from .models import ApiKey, AuditLog, Membership, Memory, MemoryTag, Organization, Project, Tag, UsageCounter, UsageEvent, User
from .recall import build_memory_pack
from .schemas import (
    ApiKeyCreate,
    ApiKeyCreatedOut,
    ApiKeyOut,
    AuditLogOut,
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
DAILY_MEMORY_LIMIT  = int(os.getenv("DAILY_MEMORY_LIMIT",  "100"))
DAILY_RECALL_LIMIT  = int(os.getenv("DAILY_RECALL_LIMIT",  "50"))
DAILY_PROJECT_LIMIT = int(os.getenv("DAILY_PROJECT_LIMIT", "10"))

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
    xff = request.headers.get("x-forwarded-for", "").strip()
    raw_ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "")
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


async def _check_daily_limit(db: AsyncSession, auth_user_id: int | None, field: str, limit: int) -> None:
    """Raise HTTP 429 if the user has hit their daily limit for *field*.

    Skips the check when:
    - auth_user_id is None (API-key-only calls, no auth user)
    - limit <= 0 (unlimited)
    """
    if auth_user_id is None or limit <= 0:
        return
    counter = await _get_usage_counter(db, auth_user_id)
    if counter is not None:
        current = getattr(counter, field, 0) or 0
        if current >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit reached ({limit}). Resets at midnight UTC.",
            )


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
    return UsageOut(
        day=today.isoformat(),
        memories_created=counter.memories_created if counter else 0,
        recall_queries=counter.recall_queries if counter else 0,
        projects_created=counter.projects_created if counter else 0,
        limits=UsageLimitsOut(
            memories_per_day=DAILY_MEMORY_LIMIT,
            recalls_per_day=DAILY_RECALL_LIMIT,
            projects_per_day=DAILY_PROJECT_LIMIT,
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

    memory = Memory(
        project_id=project.id,
        created_by_user_id=ctx.actor_user_id,
        type=payload.type,
        source=payload.source,
        title=payload.title,
        content=payload.content,
        metadata_json=payload.metadata or {},
        content_hash=_content_hash(payload.content),
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
    await db.commit()
    await db.refresh(memory)
    return _memory_to_out(memory, tag_names)


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

    auth_user_id: int | None = getattr(request.state, "auth_user_id", None)
    await _check_daily_limit(db, auth_user_id, "recall_queries", DAILY_RECALL_LIMIT)

    query_clean = query.strip()
    top_with_rank: list[tuple[Memory, float | None]] = []
    if query_clean:
        tsquery = func.websearch_to_tsquery("english", query_clean)
        rank = func.ts_rank_cd(Memory.search_tsv, tsquery).label("rank_score")
        fts_result = await db.execute(
            select(Memory, rank)
            .where(Memory.project_id == project.id)
            .where(Memory.search_tsv.op("@@")(tsquery))
            .order_by(desc(rank), Memory.created_at.desc(), Memory.id.desc())
            .limit(limit)
        )
        top_with_rank = [(row[0], float(row[1])) for row in fts_result.all()]
        if not top_with_rank:
            fallback_result = await db.execute(
                select(Memory)
                .where(Memory.project_id == project.id)
                .order_by(Memory.created_at.desc(), Memory.id.desc())
                .limit(limit)
            )
            top_with_rank = [(m, None) for m in fallback_result.scalars().all()]
    else:
        recent_result = await db.execute(
            select(Memory)
            .where(Memory.project_id == project.id)
            .order_by(Memory.created_at.desc(), Memory.id.desc())
            .limit(limit)
        )
        top_with_rank = [(m, None) for m in recent_result.scalars().all()]

    pack = build_memory_pack(query_clean, [(m.type, m.content) for m, _ in top_with_rank])
    await write_usage(
        db,
        request=request,
        ctx=ctx,
        event_type="recall_called",
        org_id=project.org_id,
        project_id=project.id,
    )
    await _increment_daily_counter(db, auth_user_id, "recall_queries")
    await db.commit()

    tag_map = await _load_tag_names(db, [m.id for m, _ in top_with_rank])
    out_items = [_recall_item_to_out(m, tag_map.get(m.id, []), rs) for m, rs in top_with_rank]
    return RecallOut(
        project_id=project.id,
        query=query_clean,
        memory_pack_text=pack,
        items=out_items,
    )
