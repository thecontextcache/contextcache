"""Inbox API — human triage UI for LLM-suggested memory drafts.

Inbox items are created by the Refinery worker from raw captures.
Users approve, reject, or edit-then-approve drafts here.

Approving an item runs the full memory-creation pipeline (embedding,
Hilbert index, FTS tsvector trigger) — exactly the same path as
POST /projects/{id}/memories — so all downstream search and recall
features work identically on promoted memories.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .analyzer.algorithm import compute_embedding, compute_hilbert_index
from .db import get_db
from .models import (
    InboxItem,
    Memory,
    Project,
)
from .routes import (
    RequestContext,
    _content_hash,
    _increment_daily_counter,
    _increment_usage_period,
    get_actor_context,
    get_project_or_404,
    require_role,
    write_audit,
    write_usage,
    DAILY_MEMORY_LIMIT,
    _check_daily_limit,
)
from .schemas import InboxItemEditIn, InboxItemOut, InboxListOut, MemoryOut

inbox_router = APIRouter(tags=["inbox"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _item_to_out(item: InboxItem) -> InboxItemOut:
    return InboxItemOut(
        id=item.id,
        project_id=item.project_id,
        raw_capture_id=item.raw_capture_id,
        promoted_memory_id=item.promoted_memory_id,
        suggested_type=item.suggested_type,
        suggested_title=item.suggested_title,
        suggested_content=item.suggested_content,
        confidence_score=float(item.confidence_score),
        status=item.status,
        created_at=item.created_at,
        reviewed_at=item.reviewed_at,
    )


async def _get_inbox_item_or_404(
    db: AsyncSession, item_id: int, ctx: RequestContext
) -> InboxItem:
    item = (
        await db.execute(select(InboxItem).where(InboxItem.id == item_id).limit(1))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    # Verify the caller can access the project this item belongs to.
    await get_project_or_404(db, item.project_id, ctx)
    return item


# ---------------------------------------------------------------------------
# GET /projects/{project_id}/inbox
# ---------------------------------------------------------------------------

@inbox_router.get("/projects/{project_id}/inbox", response_model=InboxListOut)
async def list_inbox(
    project_id: int,
    status: str = Query(default="pending", description="Filter by status (pending/approved/rejected/merged/all)"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> InboxListOut:
    """Return inbox items for a project, newest first.

    By default returns only ``pending`` drafts.
    Pass ``?status=all`` to see every item regardless of lifecycle stage.
    """
    require_role(ctx, "viewer")
    project = await get_project_or_404(db, project_id, ctx)

    stmt = select(InboxItem).where(InboxItem.project_id == project.id)
    if status != "all":
        stmt = stmt.where(InboxItem.status == status)

    items = (
        await db.execute(
            stmt.order_by(InboxItem.created_at.desc(), InboxItem.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()

    return InboxListOut(
        project_id=project.id,
        total=len(items),
        items=[_item_to_out(i) for i in items],
    )


# ---------------------------------------------------------------------------
# POST /inbox/{item_id}/approve
# ---------------------------------------------------------------------------

@inbox_router.post("/inbox/{item_id}/approve", response_model=MemoryOut)
async def approve_inbox_item(
    item_id: int,
    edits: InboxItemEditIn | None = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> MemoryOut:
    """Approve a draft and promote it to a real Memory.

    Optionally supply ``edits`` to override the type, title, or content
    before promotion.

    CRITICAL: Promotion goes through the full memory-creation pipeline:
      - compute_embedding() for pgvector storage
      - compute_hilbert_index() for the Hilbert pre-filter
      - content_hash for deduplication
      - FTS tsvector is updated via the existing DB trigger
      - Usage counters are incremented
      - An audit log entry is written
    """
    require_role(ctx, "member")
    item = await _get_inbox_item_or_404(db, item_id, ctx)

    if item.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Item is already {item.status!r}; only pending items can be approved.",
        )

    # Apply optional caller edits.
    final_type = (edits.suggested_type if edits and edits.suggested_type else None) or item.suggested_type
    final_title = (edits.suggested_title if edits and edits.suggested_title else None) or item.suggested_title
    final_content = (edits.suggested_content if edits and edits.suggested_content else None) or item.suggested_content

    if not final_content or not final_content.strip():
        raise HTTPException(status_code=422, detail="content must not be empty")

    auth_user_id: int | None = getattr(request.state, "auth_user_id", None) if request else None
    await _check_daily_limit(db, auth_user_id, "memories_created", DAILY_MEMORY_LIMIT)

    # Compute embedding + Hilbert index (same as create_memory route).
    embedding_text = " ".join(p for p in [final_title or "", final_content] if p).strip()
    embedding = compute_embedding(embedding_text)
    hilbert = compute_hilbert_index(embedding)

    memory = Memory(
        project_id=item.project_id,
        created_by_user_id=ctx.actor_user_id,
        type=final_type,
        source="api",
        title=final_title,
        content=final_content,
        metadata_json={"inbox_item_id": item.id, "confidence_score": float(item.confidence_score)},
        content_hash=_content_hash(final_content),
        search_vector=embedding,
        embedding_vector=embedding,
        hilbert_index=hilbert,
    )
    db.add(memory)
    await db.flush()

    # Update inbox item.
    item.status = "approved"
    item.promoted_memory_id = memory.id
    item.reviewed_at = datetime.now(timezone.utc)

    # Retrieve project for audit / usage helpers.
    project = (
        await db.execute(select(Project).where(Project.id == item.project_id).limit(1))
    ).scalar_one()

    await write_audit(
        db,
        ctx=ctx,
        org_id=project.org_id,
        action="inbox.approve",
        entity_type="memory",
        entity_id=memory.id,
        metadata={"type": memory.type, "inbox_item_id": item.id},
    )
    if request:
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
    await db.commit()
    await db.refresh(memory)

    # Fire-and-forget embedding worker task (no-op until WORKER_ENABLED=true).
    from app.worker.tasks import compute_memory_embedding, _enqueue_if_enabled
    _enqueue_if_enabled(compute_memory_embedding, memory.id)

    return MemoryOut(
        id=memory.id,
        project_id=memory.project_id,
        created_by_user_id=memory.created_by_user_id,
        type=memory.type,
        source=memory.source,
        title=memory.title,
        content=memory.content,
        metadata=memory.metadata_json or {},
        tags=[],
        created_at=memory.created_at,
        updated_at=memory.updated_at,
    )


# ---------------------------------------------------------------------------
# POST /inbox/{item_id}/reject
# ---------------------------------------------------------------------------

@inbox_router.post("/inbox/{item_id}/reject", response_model=InboxItemOut)
async def reject_inbox_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> InboxItemOut:
    """Reject a pending draft — it will no longer appear in the inbox."""
    require_role(ctx, "member")
    item = await _get_inbox_item_or_404(db, item_id, ctx)

    if item.status not in {"pending"}:
        raise HTTPException(
            status_code=409,
            detail=f"Item is already {item.status!r}; only pending items can be rejected.",
        )

    item.status = "rejected"
    item.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    return _item_to_out(item)
