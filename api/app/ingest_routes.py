"""Ingest API — captures raw data from CLI, Chrome extension, MCP, and email.

Each capture is stored immediately.  When the Celery worker is enabled
(WORKER_ENABLED=true) the capture is handed off asynchronously to the Refinery
worker (process_raw_capture_task) which uses an LLM to extract InboxItems.

When the worker is disabled (default) the same extraction logic runs inline,
synchronously in the request, so the Inbox is populated immediately without
needing Redis or Celery.

Auth: same API-key / session middleware as all other routes.
RBAC: requires at minimum "member" role for the org.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import InboxItem, Organization, RawCapture
from .routes import RequestContext, get_actor_context, require_role
from .schemas import RawCaptureIn, RawCaptureQueuedOut

logger = logging.getLogger(__name__)

ingest_router = APIRouter(prefix="/ingest", tags=["ingest"])

_ALLOWED_SOURCES = {"chrome_ext", "cli", "mcp", "email"}
_WORKER_ENABLED = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"


async def _run_refinery_inline(
    db: AsyncSession,
    capture: RawCapture,
) -> int:
    """Run the LLM refinery stub synchronously in the current DB session.

    Called when WORKER_ENABLED=false so the Inbox is populated immediately
    without needing a Celery worker.  When a real LLM is wired up, only
    tasks.refine_content_with_llm needs to change — this path benefits too.
    """
    from .worker.tasks import refine_content_with_llm

    try:
        drafts = refine_content_with_llm(capture.payload)
    except Exception as exc:
        logger.error("[ingest] inline refinery failed capture_id=%s: %s", capture.id, exc)
        return 0

    inserted = 0
    for draft in drafts:
        suggested_type = str(draft.get("type", "note"))[:50]
        suggested_title = str(draft.get("title", ""))[:500] or None
        suggested_content = str(draft.get("content", "")).strip()
        confidence = float(draft.get("confidence_score", 0.8))

        if not suggested_content:
            continue

        db.add(
            InboxItem(
                project_id=capture.project_id,
                raw_capture_id=capture.id,
                suggested_type=suggested_type,
                suggested_title=suggested_title,
                suggested_content=suggested_content,
                confidence_score=max(0.0, min(1.0, confidence)),
                status="pending",
            )
        )
        inserted += 1

    capture.processed_at = datetime.now(timezone.utc)
    logger.info(
        "[ingest] inline refinery complete capture_id=%s inbox_items_created=%s",
        capture.id,
        inserted,
    )
    return inserted


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
      3a. If WORKER_ENABLED=true  → enqueue process_raw_capture_task via Celery.
      3b. If WORKER_ENABLED=false → run the refinery inline so the Inbox is
          populated immediately (no Redis/Celery needed).
      4. Return 202 { status: "queued", capture_id } in both cases.

    The Inbox endpoint (GET /projects/{id}/inbox) surfaces the resulting drafts.
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

    if _WORKER_ENABLED:
        # Async path: commit first, then hand off to Celery.
        await db.commit()
        from .worker.tasks import _enqueue_if_enabled, process_raw_capture_task
        _enqueue_if_enabled(process_raw_capture_task, capture_id)
        logger.info("[ingest] capture_id=%s queued for worker", capture_id)
    else:
        # Sync path: run refinery inline in the same transaction, then commit.
        await _run_refinery_inline(db, capture)
        await db.commit()
        logger.info("[ingest] capture_id=%s processed inline (worker disabled)", capture_id)

    return RawCaptureQueuedOut(status="queued", capture_id=capture_id)
