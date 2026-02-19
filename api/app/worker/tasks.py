"""Celery task definitions.

SECURITY RULES for all tasks:
  - Never log tokens, API keys, magic links, or session cookies.
  - Never include secrets in task arguments or return values.
  - Never accept raw user content without sanitisation.
  - Log only project/memory IDs and safe summary info.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, timedelta, timezone, datetime

from .celery_app import celery_app

logger = logging.getLogger(__name__)

WORKER_ENABLED = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"
DATABASE_URL   = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://contextcache:change-me@db:5432/contextcache",
)


# ---------------------------------------------------------------------------
# Helper — guard against accidental task submission when worker is off
# ---------------------------------------------------------------------------

def _enqueue_if_enabled(task_fn, *args, **kwargs):
    """Submit a task only when WORKER_ENABLED=true.

    Usage:
        from app.worker.tasks import reindex_project, _enqueue_if_enabled
        _enqueue_if_enabled(reindex_project, project_id)
    """
    if not WORKER_ENABLED:
        logger.debug("Worker disabled — skipping task %s(%s)", task_fn.name, args)
        return None
    return task_fn.delay(*args, **kwargs)


# ---------------------------------------------------------------------------
# DB helper — async session within a sync Celery task
# ---------------------------------------------------------------------------

async def _run_in_db(coro):
    """Create a fresh async engine/session, run *coro(session)*, commit, dispose."""
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with async_session() as session:
            result = await coro(session)
            await session.commit()
            return result
    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Task: reindex_project
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.reindex_project",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def reindex_project(self, project_id: int) -> dict:
    """Rebuild FTS / embedding index for all memories in a project.

    Currently logs a safe message and returns.
    When embeddings are ready, replace the body with actual indexing logic.
    """
    logger.info("[worker] reindex_project started project_id=%s", project_id)
    # Future: query DB, compute embeddings, upsert memory_embeddings rows
    logger.info("[worker] reindex_project complete project_id=%s (placeholder)", project_id)
    return {"status": "ok", "project_id": project_id}


# ---------------------------------------------------------------------------
# Task: cleanup_expired_magic_links
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.cleanup_expired_magic_links",
    bind=True,
    max_retries=2,
)
def cleanup_expired_magic_links(self) -> dict:
    """Delete unconsumed auth_magic_links that expired more than 24 h ago.

    Safe to run via Celery Beat (e.g. every hour).
    """
    logger.info("[worker] cleanup_expired_magic_links started")

    from sqlalchemy import delete as sa_delete
    from app.models import AuthMagicLink

    async def _cleanup(session):
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        result = await session.execute(
            sa_delete(AuthMagicLink).where(
                AuthMagicLink.consumed_at.is_(None),
                AuthMagicLink.expires_at < cutoff,
            )
        )
        return result.rowcount

    deleted = asyncio.run(_run_in_db(_cleanup))
    logger.info("[worker] cleanup_expired_magic_links deleted=%s", deleted)
    return {"status": "ok", "deleted": deleted}


# ---------------------------------------------------------------------------
# Task: cleanup_old_usage_counters
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.cleanup_old_usage_counters",
    bind=True,
    max_retries=2,
)
def cleanup_old_usage_counters(self, retain_days: int = 90) -> dict:
    """Delete usage_counter rows older than *retain_days* days.

    Rows naturally expire because the day column partitions them.
    This task prevents unbounded table growth.
    Safe to run nightly via Celery Beat.
    """
    logger.info("[worker] cleanup_old_usage_counters started retain_days=%s", retain_days)

    from sqlalchemy import delete as sa_delete
    from app.models import UsageCounter

    async def _cleanup(session):
        cutoff = date.today() - timedelta(days=retain_days)
        result = await session.execute(
            sa_delete(UsageCounter).where(UsageCounter.day < cutoff)
        )
        return result.rowcount

    deleted = asyncio.run(_run_in_db(_cleanup))
    logger.info("[worker] cleanup_old_usage_counters deleted=%s rows", deleted)
    return {"status": "ok", "deleted": deleted}


# ---------------------------------------------------------------------------
# Task: cleanup_old_login_events
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.cleanup_old_login_events",
    bind=True,
    max_retries=2,
)
def cleanup_old_login_events(self, retain_days: int = 90) -> dict:
    """Delete auth_login_events older than *retain_days* days.

    The per-user retention (last 10) is enforced at write time; this task
    handles the time-based cleanup for compliance / storage hygiene.
    """
    logger.info("[worker] cleanup_old_login_events started retain_days=%s", retain_days)

    from sqlalchemy import delete as sa_delete
    from app.models import AuthLoginEvent

    async def _cleanup(session):
        cutoff = datetime.now(timezone.utc) - timedelta(days=retain_days)
        result = await session.execute(
            sa_delete(AuthLoginEvent).where(AuthLoginEvent.created_at < cutoff)
        )
        return result.rowcount

    deleted = asyncio.run(_run_in_db(_cleanup))
    logger.info("[worker] cleanup_old_login_events deleted=%s rows", deleted)
    return {"status": "ok", "deleted": deleted}
