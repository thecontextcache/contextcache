"""Celery task definitions.

SECURITY RULES for all tasks:
  - Never log tokens, API keys, magic links, or session cookies.
  - Never include secrets in task arguments or return values.
  - Never accept raw user content without sanitisation.
  - Log only project/memory IDs and safe summary info.
"""
from __future__ import annotations

import logging
import os

from .celery_app import celery_app

logger = logging.getLogger(__name__)

WORKER_ENABLED = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"


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
# Example task: reindex_project
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.reindex_project",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def reindex_project(self, project_id: int) -> dict:
    """Rebuild FTS / embedding index for all memories in a project.

    Currently a placeholder — logs a safe message and returns.
    When embeddings are ready, replace the body with actual indexing logic.

    Args:
        project_id: The integer project ID to reindex.
                    Never pass tokens, emails, or secrets here.
    """
    logger.info("[worker] reindex_project started project_id=%s", project_id)
    # TODO: query DB, compute embeddings, upsert memory_embeddings rows
    logger.info("[worker] reindex_project complete project_id=%s (placeholder)", project_id)
    return {"status": "ok", "project_id": project_id}


# ---------------------------------------------------------------------------
# Example task: cleanup_expired_magic_links
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.cleanup_expired_magic_links",
    bind=True,
    max_retries=2,
)
def cleanup_expired_magic_links(self) -> dict:
    """Delete auth_magic_links older than 1 day that were never consumed.

    Safe to run periodically via Celery Beat.
    Placeholder — actual DB deletion query to be added.
    """
    logger.info("[worker] cleanup_expired_magic_links started")
    # TODO: delete rows where consumed_at IS NULL AND expires_at < now() - interval '1 day'
    logger.info("[worker] cleanup_expired_magic_links complete (placeholder)")
    return {"status": "ok"}
