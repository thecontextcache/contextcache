from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import generate_api_key, get_db, hash_api_key
from .models import ApiKey, AuditLog, Membership, Organization, Project, Memory, User
from .recall import build_memory_pack
from .schemas import (
    ApiKeyCreate,
    ApiKeyCreatedOut,
    ApiKeyOut,
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
)

router = APIRouter()

ROLE_RANK: dict[str, int] = {"viewer": 1, "member": 2, "admin": 3, "owner": 4}


@dataclass(frozen=True)
class RequestContext:
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
        org_id=request.state.org_id,
        role=request.state.role,
        actor_user_id=request.state.actor_user_id,
        actor_email=request.state.actor_email,
        api_key_prefix=request.state.api_key_prefix,
        bootstrap_mode=request.state.bootstrap_mode,
    )


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
    org_id: int,
    actor_user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            org_id=org_id,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata or {},
        )
    )


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
async def get_me(ctx: RequestContext = Depends(get_request_context)) -> MeOut:
    return MeOut(
        org_id=ctx.org_id,
        role=ctx.role,
        api_key_prefix=ctx.api_key_prefix,
        actor_user_id=ctx.actor_user_id,
    )


@router.post("/orgs", response_model=OrgOut, status_code=201)
async def create_org(
    payload: OrgCreate,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
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
        org_id=org.id,
        actor_user_id=bootstrap_actor_user_id,
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
    ctx: RequestContext = Depends(get_request_context),
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
    ctx: RequestContext = Depends(get_request_context),
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
        org_id=org_id,
        actor_user_id=ctx.actor_user_id,
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
    ctx: RequestContext = Depends(get_request_context),
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


@router.post("/orgs/{org_id}/projects", response_model=ProjectOut, status_code=201)
async def create_org_project(
    org_id: int,
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
) -> ProjectOut:
    ensure_org_access(ctx, org_id)
    require_role(ctx, "admin")
    await get_org_or_404(db, org_id)

    project = Project(name=payload.name, org_id=org_id, created_by_user_id=ctx.actor_user_id)
    db.add(project)
    await db.flush()
    await write_audit(
        db,
        org_id=org_id,
        actor_user_id=ctx.actor_user_id,
        action="project.create",
        entity_type="project",
        entity_id=project.id,
        metadata={"name": project.name},
    )
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
    ctx: RequestContext = Depends(get_request_context),
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
    ctx: RequestContext = Depends(get_request_context),
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
        org_id=org_id,
        actor_user_id=ctx.actor_user_id,
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
    ctx: RequestContext = Depends(get_request_context),
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
    ctx: RequestContext = Depends(get_request_context),
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
            org_id=org_id,
            actor_user_id=ctx.actor_user_id,
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
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
) -> ProjectOut:
    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    return await create_org_project(org_id=ctx.org_id, payload=payload, db=db, ctx=ctx)


@router.get("/projects", response_model=List[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
) -> List[ProjectOut]:
    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    return await list_org_projects(org_id=ctx.org_id, db=db, ctx=ctx)


@router.post("/projects/{project_id}/memories", response_model=MemoryOut, status_code=201)
async def create_memory(
    project_id: int,
    payload: MemoryCreate,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
) -> MemoryOut:
    require_role(ctx, "member")
    project = await get_project_or_404(db, project_id, ctx)

    memory = Memory(project_id=project.id, type=payload.type, content=payload.content)
    db.add(memory)
    await db.flush()
    await write_audit(
        db,
        org_id=project.org_id,
        actor_user_id=ctx.actor_user_id,
        action="memory.create",
        entity_type="memory",
        entity_id=memory.id,
        metadata={"type": memory.type},
    )
    await db.commit()
    await db.refresh(memory)
    return MemoryOut(
        id=memory.id,
        project_id=memory.project_id,
        type=memory.type,
        content=memory.content,
        created_at=memory.created_at,
    )


@router.get("/projects/{project_id}/memories", response_model=List[MemoryOut])
async def list_memories(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
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
    return [
        MemoryOut(
            id=i.id,
            project_id=i.project_id,
            type=i.type,
            content=i.content,
            created_at=i.created_at,
        )
        for i in items
    ]


@router.get("/projects/{project_id}/recall", response_model=RecallOut)
async def recall(
    project_id: int,
    query: str = "",
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
) -> RecallOut:
    require_role(ctx, "viewer")
    project = await get_project_or_404(db, project_id, ctx)

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
    out_items = [
        RecallItemOut(
            id=m.id,
            project_id=m.project_id,
            type=m.type,
            content=m.content,
            created_at=m.created_at,
            rank_score=rank_score,
        )
        for m, rank_score in top_with_rank
    ]
    return RecallOut(
        project_id=project.id,
        query=query_clean,
        memory_pack_text=pack,
        items=out_items,
    )
