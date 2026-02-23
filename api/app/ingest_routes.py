"""Ingest API — captures raw data from CLI, Chrome extension, MCP, and email.

Each capture is stored immediately and handed off to the Refinery worker
(process_raw_capture_task) which uses an LLM to extract structured InboxItems.

Auth: same API-key / session middleware as all other routes.
RBAC: requires at minimum "member" role for the org.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import Organization, RawCapture
from .routes import RequestContext, get_actor_context, require_role
from .schemas import RawCaptureIn, RawCaptureOut, RawCaptureQueuedOut

ingest_router = APIRouter(prefix="/ingest", tags=["ingest"])

_ALLOWED_SOURCES = {"chrome_ext", "cli", "mcp", "email"}


@ingest_router.post("/raw", response_model=RawCaptureQueuedOut, status_code=202)
async def ingest_raw(
    payload: RawCaptureIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> RawCaptureQueuedOut:
    """Accept a raw payload from any capture source and queue it for LLM refining.

    Steps:
      1. Validate the caller has at least member-level access to the org.
      2. Persist a RawCapture row with the caller-supplied payload.
      3. Enqueue the Celery task ``process_raw_capture_task`` asynchronously.
      4. Return immediately with { status: "queued", capture_id }.

    The caller does **not** need to wait for the LLM — the Inbox endpoint
    (GET /projects/{id}/inbox) surfaces the resulting drafts once the worker
    finishes.
    """
    require_role(ctx, "member")

    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    if payload.source not in _ALLOWED_SOURCES:
        raise HTTPException(
            status_code=422,
            detail=f"source must be one of {sorted(_ALLOWED_SOURCES)}",
        )

    capture = RawCapture(
        org_id=ctx.org_id,
        project_id=payload.project_id,
        source=payload.source,
        payload=payload.payload or {},
    )
    db.add(capture)
    await db.flush()
    capture_id = capture.id
    await db.commit()

    # Fire-and-forget — silently skipped when WORKER_ENABLED=false.
    from app.worker.tasks import _enqueue_if_enabled, process_raw_capture_task
    _enqueue_if_enabled(process_raw_capture_task, capture_id)

    return RawCaptureQueuedOut(status="queued", capture_id=capture_id)
