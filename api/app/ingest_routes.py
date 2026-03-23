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
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import InboxItem, RawCapture
from .rate_limit import check_ingest_limits
from .routes import RequestContext, _extract_client_ip, get_actor_context, require_role, write_audit
from .schemas import IntegrationsCapabilitiesOut, RawCaptureIn, RawCaptureOut, RawCaptureQueuedOut

logger = logging.getLogger(__name__)

ingest_router = APIRouter(prefix="/ingest", tags=["ingest"])

_ALLOWED_SOURCES = {"chrome_ext", "cli", "mcp", "email"}
_WORKER_ENABLED = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"
_API_VERSION = os.getenv("API_VERSION", "2026-03-20").strip() or "2026-03-20"
_INGEST_DEAD_LETTER_MAX_ATTEMPTS = int(os.getenv("INGEST_DEAD_LETTER_MAX_ATTEMPTS", "4"))
_REPLAYABLE_CAPTURE_STATUSES = {"failed", "dead_letter"}


def _capture_payload_bytes(payload: dict) -> int:
    return len(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def _set_capture_headers(response: Response, *, capture_id: int, processing_status: str) -> None:
    response.headers["X-ContextCache-API-Version"] = _API_VERSION
    response.headers["X-ContextCache-Capture-Id"] = str(capture_id)
    response.headers["X-ContextCache-Processing-Status"] = processing_status


def _capture_to_out(capture: RawCapture) -> RawCaptureOut:
    return RawCaptureOut(
        id=capture.id,
        org_id=capture.org_id,
        project_id=capture.project_id,
        idempotency_key=capture.idempotency_key,
        source=capture.source,
        processing_status=capture.processing_status,
        attempt_count=capture.attempt_count,
        processing_started_at=capture.processing_started_at,
        captured_at=capture.captured_at,
        processed_at=capture.processed_at,
        last_error=capture.last_error,
        last_error_at=capture.last_error_at,
        dead_lettered_at=capture.dead_lettered_at,
    )


async def _get_capture_for_org(db: AsyncSession, *, capture_id: int, org_id: int) -> RawCapture:
    capture = (
        await db.execute(
            select(RawCapture).where(RawCapture.id == capture_id, RawCapture.org_id == org_id).limit(1)
        )
    ).scalar_one_or_none()
    if capture is None:
        raise HTTPException(status_code=404, detail="Capture not found")
    return capture


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

    drafts = refine_content_with_llm(capture.payload)

    existing_items = (
        await db.execute(select(InboxItem).where(InboxItem.raw_capture_id == capture.id))
    ).scalars().all()
    for item in existing_items:
        await db.delete(item)

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
    capture.processing_status = "processed"
    capture.last_error = None
    capture.last_error_at = None
    capture.dead_lettered_at = None
    logger.info(
        "[ingest] inline refinery complete capture_id=%s inbox_items_created=%s",
        capture.id,
        inserted,
    )
    return inserted


async def _mark_worker_dispatch_failure(
    db: AsyncSession,
    *,
    ctx: RequestContext,
    capture: RawCapture,
    mode: str,
    exc: Exception,
) -> None:
    capture.processing_status = "failed"
    capture.processing_started_at = None
    capture.last_error = str(exc)[:2000]
    capture.last_error_at = datetime.now(timezone.utc)
    capture.dead_lettered_at = None
    logger.error(
        "[ingest] worker dispatch failed capture_id=%s mode=%s: %s",
        capture.id,
        mode,
        exc,
    )
    await write_audit(
        db,
        ctx=ctx,
        org_id=ctx.org_id,
        action="ingest.capture_failed",
        entity_type="raw_capture",
        entity_id=capture.id,
        metadata={"mode": mode, "error": capture.last_error},
    )
    await db.commit()


@ingest_router.post("/raw", response_model=RawCaptureQueuedOut, status_code=202)
async def ingest_raw(
    payload: RawCaptureIn,
    request: Request,
    response: Response,
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

    client_ip = _extract_client_ip(request)
    account_key = str(ctx.org_id or "")
    allowed, rl_detail = check_ingest_limits(client_ip, account_key)
    if not allowed:
        code = 503 if rl_detail and rl_detail.startswith("Service unavailable") else 429
        raise HTTPException(status_code=code, detail=rl_detail)

    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    if payload.source not in _ALLOWED_SOURCES:
        raise HTTPException(
            status_code=422,
            detail=f"source must be one of {sorted(_ALLOWED_SOURCES)}",
        )

    idempotency_key = request.headers.get("Idempotency-Key", "").strip() or None
    if idempotency_key:
        existing = (
            await db.execute(
                select(RawCapture)
                .where(RawCapture.org_id == ctx.org_id, RawCapture.idempotency_key == idempotency_key)
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing is not None:
            _set_capture_headers(response, capture_id=existing.id, processing_status=existing.processing_status)
            await write_audit(
                db,
                ctx=ctx,
                org_id=ctx.org_id,
                action="ingest.capture_duplicate",
                entity_type="raw_capture",
                entity_id=existing.id,
                metadata={
                    "idempotency_key": idempotency_key,
                    "processing_status": existing.processing_status,
                },
            )
            await db.commit()
            return RawCaptureQueuedOut(
                status="queued",
                capture_id=existing.id,
                processing_status=existing.processing_status,
                duplicate=True,
            )

    capture = RawCapture(
        org_id=ctx.org_id,
        project_id=payload.project_id,
        idempotency_key=idempotency_key,
        source=payload.source,
        payload=payload.payload or {},
        processing_status="queued",
    )
    db.add(capture)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        if not idempotency_key:
            raise
        existing = (
            await db.execute(
                select(RawCapture)
                .where(RawCapture.org_id == ctx.org_id, RawCapture.idempotency_key == idempotency_key)
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing is None:
            raise
        _set_capture_headers(response, capture_id=existing.id, processing_status=existing.processing_status)
        return RawCaptureQueuedOut(
            status="queued",
            capture_id=existing.id,
            processing_status=existing.processing_status,
            duplicate=True,
        )

    capture_id = capture.id
    payload_bytes = _capture_payload_bytes(capture.payload or {})
    await write_audit(
        db,
        ctx=ctx,
        org_id=ctx.org_id,
        action="ingest.capture_received",
        entity_type="raw_capture",
        entity_id=capture_id,
        metadata={
            "source": capture.source,
            "project_id": capture.project_id,
            "payload_bytes": payload_bytes,
            "worker_enabled": _WORKER_ENABLED,
            "idempotency_key": idempotency_key,
        },
    )

    if _WORKER_ENABLED:
        # Async path: commit first, then hand off to Celery.
        await db.commit()
        from .worker.tasks import _enqueue_if_enabled, process_raw_capture_task
        try:
            _enqueue_if_enabled(process_raw_capture_task, capture_id)
        except Exception as exc:
            await _mark_worker_dispatch_failure(
                db,
                ctx=ctx,
                capture=capture,
                mode="worker-enqueue",
                exc=exc,
            )
            _set_capture_headers(response, capture_id=capture_id, processing_status=capture.processing_status)
            return RawCaptureQueuedOut(
                status="failed",
                capture_id=capture_id,
                processing_status=capture.processing_status,
            )
        logger.info("[ingest] capture_id=%s queued for worker", capture_id)
        _set_capture_headers(response, capture_id=capture_id, processing_status="queued")
    else:
        # Sync path: run refinery inline in the same transaction, then commit.
        capture.processing_status = "processing"
        capture.processing_started_at = datetime.now(timezone.utc)
        capture.attempt_count = int(capture.attempt_count or 0) + 1
        try:
            inserted = await _run_refinery_inline(db, capture)
            await write_audit(
                db,
                ctx=ctx,
                org_id=ctx.org_id,
                action="ingest.capture_processed",
                entity_type="raw_capture",
                entity_id=capture_id,
                metadata={"inbox_items_created": inserted, "mode": "inline"},
            )
        except Exception as exc:
            logger.error("[ingest] inline refinery failed capture_id=%s: %s", capture.id, exc)
            capture.processing_status = "dead_letter"
            capture.last_error = str(exc)[:2000]
            capture.last_error_at = datetime.now(timezone.utc)
            capture.dead_lettered_at = capture.last_error_at
            await write_audit(
                db,
                ctx=ctx,
                org_id=ctx.org_id,
                action="ingest.capture_failed",
                entity_type="raw_capture",
                entity_id=capture_id,
                metadata={"mode": "inline", "error": capture.last_error},
            )
        await db.commit()
        logger.info("[ingest] capture_id=%s processed inline (worker disabled)", capture_id)
        _set_capture_headers(response, capture_id=capture_id, processing_status=capture.processing_status)

    return RawCaptureQueuedOut(
        status="queued",
        capture_id=capture_id,
        processing_status=capture.processing_status,
    )


@ingest_router.get("/raw/{capture_id}", response_model=RawCaptureOut)
async def get_raw_capture_status(
    capture_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> RawCaptureOut:
    require_role(ctx, "member")
    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")
    capture = await _get_capture_for_org(db, capture_id=capture_id, org_id=ctx.org_id)
    _set_capture_headers(response, capture_id=capture.id, processing_status=capture.processing_status)
    return _capture_to_out(capture)


@ingest_router.post("/raw/{capture_id}/replay", response_model=RawCaptureQueuedOut, status_code=202)
async def replay_raw_capture(
    capture_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext = Depends(get_actor_context),
) -> RawCaptureQueuedOut:
    require_role(ctx, "member")
    if ctx.org_id is None:
        raise HTTPException(status_code=400, detail="X-Org-Id required")

    capture = await _get_capture_for_org(db, capture_id=capture_id, org_id=ctx.org_id)
    if capture.processing_status == "processed":
        raise HTTPException(status_code=409, detail="Capture is already processed")
    if capture.processing_status not in _REPLAYABLE_CAPTURE_STATUSES:
        raise HTTPException(status_code=409, detail="Capture can only be replayed from failed or dead_letter state")
    if capture.attempt_count >= _INGEST_DEAD_LETTER_MAX_ATTEMPTS and _WORKER_ENABLED:
        raise HTTPException(status_code=409, detail="Capture exceeded replay attempt limit")

    capture.processing_status = "queued" if _WORKER_ENABLED else "processing"
    capture.processing_started_at = datetime.now(timezone.utc)
    capture.last_error = None
    capture.last_error_at = None
    capture.dead_lettered_at = None
    capture.processed_at = None

    if _WORKER_ENABLED:
        await write_audit(
            db,
            ctx=ctx,
            org_id=ctx.org_id,
            action="ingest.capture_replayed",
            entity_type="raw_capture",
            entity_id=capture.id,
            metadata={"mode": "worker"},
        )
        await db.commit()
        from .worker.tasks import _enqueue_if_enabled, process_raw_capture_task
        try:
            _enqueue_if_enabled(process_raw_capture_task, capture.id)
        except Exception as exc:
            await _mark_worker_dispatch_failure(
                db,
                ctx=ctx,
                capture=capture,
                mode="worker-replay-enqueue",
                exc=exc,
            )
            _set_capture_headers(response, capture_id=capture.id, processing_status=capture.processing_status)
            return RawCaptureQueuedOut(
                status="failed",
                capture_id=capture.id,
                processing_status=capture.processing_status,
                duplicate=False,
            )
    else:
        capture.attempt_count = int(capture.attempt_count or 0) + 1
        try:
            inserted = await _run_refinery_inline(db, capture)
            await write_audit(
                db,
                ctx=ctx,
                org_id=ctx.org_id,
                action="ingest.capture_replayed",
                entity_type="raw_capture",
                entity_id=capture.id,
                metadata={"mode": "inline", "inbox_items_created": inserted},
            )
        except Exception as exc:
            capture.processing_status = "dead_letter"
            capture.last_error = str(exc)[:2000]
            capture.last_error_at = datetime.now(timezone.utc)
            capture.dead_lettered_at = capture.last_error_at
            await write_audit(
                db,
                ctx=ctx,
                org_id=ctx.org_id,
                action="ingest.capture_failed",
                entity_type="raw_capture",
                entity_id=capture.id,
                metadata={"mode": "inline-replay", "error": capture.last_error},
            )
        await db.commit()

    _set_capture_headers(response, capture_id=capture.id, processing_status=capture.processing_status)
    return RawCaptureQueuedOut(
        status="queued",
        capture_id=capture.id,
        processing_status=capture.processing_status,
        duplicate=False,
    )


@ingest_router.get("/capabilities", response_model=IntegrationsCapabilitiesOut)
async def ingest_capabilities(
    _ctx: RequestContext = Depends(get_actor_context),
) -> IntegrationsCapabilitiesOut:
    return IntegrationsCapabilitiesOut(
        api_version=_API_VERSION,
        auth_modes=["session", "api_key", "bearer"],
        ingest_sources=sorted(_ALLOWED_SOURCES),
        recall_formats=["text", "toon"],
        brain_batch_max_targets=int(os.getenv("BRAIN_BATCH_MAX_TARGETS", "1000")),
        supports_idempotency=True,
        supports_ingest_replay=True,
        supports_batch_undo=["add_tag", "remove_tag", "pin", "unpin"],
    )
