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


def _skip_if_disabled(task_name: str) -> dict | None:
    if WORKER_ENABLED:
        return None
    logger.info("[worker] %s skipped (WORKER_ENABLED=false)", task_name)
    return {"status": "skipped", "reason": "WORKER_ENABLED=false"}


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
    skipped = _skip_if_disabled("reindex_project")
    if skipped is not None:
        return skipped
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
    skipped = _skip_if_disabled("cleanup_expired_magic_links")
    if skipped is not None:
        return skipped
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
    skipped = _skip_if_disabled("cleanup_old_usage_counters")
    if skipped is not None:
        return skipped
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
    skipped = _skip_if_disabled("cleanup_old_login_events")
    if skipped is not None:
        return skipped
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


# ---------------------------------------------------------------------------
# Task: cleanup_old_waitlist_entries
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.cleanup_old_waitlist_entries",
    bind=True,
    max_retries=2,
)
def cleanup_old_waitlist_entries(self, retain_days: int = 90) -> dict:
    """Delete waitlist rows older than retain_days."""
    skipped = _skip_if_disabled("cleanup_old_waitlist_entries")
    if skipped is not None:
        return skipped
    logger.info("[worker] cleanup_old_waitlist_entries started retain_days=%s", retain_days)

    from sqlalchemy import delete as sa_delete
    from app.models import Waitlist

    async def _cleanup(session):
        cutoff = datetime.now(timezone.utc) - timedelta(days=retain_days)
        result = await session.execute(sa_delete(Waitlist).where(Waitlist.created_at < cutoff))
        return result.rowcount

    deleted = asyncio.run(_run_in_db(_cleanup))
    logger.info("[worker] cleanup_old_waitlist_entries deleted=%s rows", deleted)
    return {"status": "ok", "deleted": deleted}


# ---------------------------------------------------------------------------
# Task: cleanup_expired_sessions
# ---------------------------------------------------------------------------

@celery_app.task(name="contextcache.cleanup_expired_sessions", bind=True, max_retries=2)
def cleanup_expired_sessions(self) -> dict:
    skipped = _skip_if_disabled("cleanup_expired_sessions")
    if skipped is not None:
        return skipped
    logger.info("[worker] cleanup_expired_sessions started")

    from sqlalchemy import delete as sa_delete
    from app.models import AuthSession

    async def _cleanup(session):
        now = datetime.now(timezone.utc)
        result = await session.execute(sa_delete(AuthSession).where(AuthSession.expires_at < now))
        return result.rowcount

    deleted = asyncio.run(_run_in_db(_cleanup))
    logger.info("[worker] cleanup_expired_sessions deleted=%s rows", deleted)
    return {"status": "ok", "deleted": deleted}


# ---------------------------------------------------------------------------
# Task: cleanup_expired_invites
# ---------------------------------------------------------------------------

@celery_app.task(name="contextcache.cleanup_expired_invites", bind=True, max_retries=2)
def cleanup_expired_invites(self) -> dict:
    skipped = _skip_if_disabled("cleanup_expired_invites")
    if skipped is not None:
        return skipped
    logger.info("[worker] cleanup_expired_invites started")

    from app.models import AuthInvite
    from sqlalchemy import update

    async def _cleanup(session):
        now = datetime.now(timezone.utc)
        result = await session.execute(
            update(AuthInvite)
            .where(
                AuthInvite.revoked_at.is_(None),
                AuthInvite.accepted_at.is_(None),
                AuthInvite.expires_at < now,
            )
            .values(revoked_at=now)
        )
        return result.rowcount

    updated = asyncio.run(_run_in_db(_cleanup))
    logger.info("[worker] cleanup_expired_invites revoked=%s rows", updated)
    return {"status": "ok", "revoked": updated}


# ---------------------------------------------------------------------------
# Task: refresh_recall_hedge_p95_cache
# ---------------------------------------------------------------------------

@celery_app.task(name="contextcache.refresh_recall_hedge_p95_cache", bind=True, max_retries=2)
def refresh_recall_hedge_p95_cache(
    self,
    lookback_hours: int = 24,
    min_samples: int = 5,
) -> dict:
    """Compute per-org CAG p95 latency and cache in Redis for fast hedge lookup."""
    skipped = _skip_if_disabled("refresh_recall_hedge_p95_cache")
    if skipped is not None:
        return skipped
    logger.info(
        "[worker] refresh_recall_hedge_p95_cache started lookback_hours=%s min_samples=%s",
        lookback_hours,
        min_samples,
    )

    from sqlalchemy import text
    from app.rate_limit import set_cached_hedge_p95_ms

    async def _refresh(session):
        rows = (
            await session.execute(
                text(
                    """
                    SELECT
                        org_id,
                        percentile_cont(0.95) WITHIN GROUP (ORDER BY cag_duration_ms) AS p95_ms,
                        COUNT(*) AS sample_count
                    FROM recall_timings
                    WHERE cag_duration_ms IS NOT NULL
                      AND created_at >= (NOW() - (:lookback_hours || ' hours')::interval)
                    GROUP BY org_id
                    """
                ),
                {"lookback_hours": int(lookback_hours)},
            )
        ).all()
        return rows

    try:
        rows = asyncio.run(_run_in_db(_refresh))
    except Exception as exc:
        logger.warning("[worker] refresh_recall_hedge_p95_cache skipped: %s", exc)
        return {"status": "skipped", "reason": str(exc)}
    cached = 0
    for org_id, p95_ms, sample_count in rows:
        if p95_ms is None:
            continue
        try:
            samples = int(sample_count or 0)
        except (TypeError, ValueError):
            samples = 0
        if samples < int(min_samples):
            continue
        delay_ms = max(1, int(float(p95_ms)))
        if set_cached_hedge_p95_ms(int(org_id), delay_ms):
            cached += 1

    logger.info("[worker] refresh_recall_hedge_p95_cache cached_orgs=%s", cached)
    return {"status": "ok", "cached_orgs": cached}


# ---------------------------------------------------------------------------
# Task: contextualize_memory_with_ollama
# ---------------------------------------------------------------------------

@celery_app.task(name="contextcache.contextualize_memory_with_ollama", bind=True, max_retries=2)
def contextualize_memory_with_ollama(self, memory_id: int) -> dict:
    skipped = _skip_if_disabled("contextualize_memory_with_ollama")
    if skipped is not None:
        return skipped

    import json
    from urllib import request as urllib_request

    base_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").strip().rstrip("/")
    endpoint = os.getenv("OLLAMA_CHAT_ENDPOINT", f"{base_url}/api/generate").strip()
    model = os.getenv("OLLAMA_CONTEXT_MODEL", os.getenv("OLLAMA_MODEL", "llama3.1")).strip() or "llama3.1"
    logger.info("[worker] contextualize_memory_with_ollama started memory_id=%s", memory_id)

    from sqlalchemy import select
    from app.models import Memory, MemoryEmbedding

    async def _contextualize(session):
        memory = await session.get(Memory, memory_id)
        if memory is None:
            return {"status": "not_found", "memory_id": memory_id}
        prompt = (
            "Summarize this memory in one concise sentence and suggest up to 3 tags as JSON "
            '{"summary":"...","tags":["..."]}.\n\n'
            f"Title: {memory.title or ''}\nContent: {memory.content}"
        )
        req = urllib_request.Request(
            endpoint,
            data=json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            raw_response = payload.get("response", "").strip()
        except Exception as exc:
            return {"status": "failed", "memory_id": memory_id, "detail": str(exc)}

        mem_meta = dict(memory.metadata_json or {})
        mem_meta["ollama_context"] = {"model": model, "response": raw_response}
        memory.metadata_json = mem_meta

        emb_row = (
            await session.execute(select(MemoryEmbedding).where(MemoryEmbedding.memory_id == memory_id).limit(1))
        ).scalar_one_or_none()
        if emb_row is not None:
            emb_meta = dict(emb_row.metadata_json or {})
            emb_meta["contextualized"] = True
            emb_meta["context_model"] = model
            emb_row.metadata_json = emb_meta
            emb_row.updated_at = datetime.now(timezone.utc)

        return {"status": "ok", "memory_id": memory_id}

    return asyncio.run(_run_in_db(_contextualize))


# ---------------------------------------------------------------------------
# Task: compute_memory_embedding  (placeholder — activates when pgvector ready)
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.compute_memory_embedding",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def compute_memory_embedding(self, memory_id: int, model: str = "text-embedding-3-small") -> dict:
    """Compute and store an embedding vector for a single memory.

    This is a PLACEHOLDER.  When pgvector + an embedding provider are ready:
      1. Enable the pgvector extension in Postgres.
      2. Run:  ALTER TABLE memory_embeddings ADD COLUMN embedding vector(1536);
              CREATE INDEX ON memory_embeddings USING ivfflat (embedding vector_cosine_ops);
      3. Replace this body with actual embedding computation and upsert logic.
      4. Set WORKER_ENABLED=true and ANALYZER_MODE=local (or service).

    The task is already registered and will be enqueued automatically when
    _enqueue_if_enabled(compute_memory_embedding, memory_id) is called from
    the memory-creation route.

    Safe: only receives an integer memory_id, no raw content in task args.
    """
    skipped = _skip_if_disabled("compute_memory_embedding")
    if skipped is not None:
        return skipped

    logger.info("[worker] compute_memory_embedding started memory_id=%s model=%s", memory_id, model)

    from app.analyzer.core import compute_embedding
    from app.analyzer.algorithm import compute_hilbert_index
    from app.models import Memory, MemoryEmbedding

    async def _upsert(session):
        mem = await session.get(Memory, memory_id)
        if not mem:
            return {"status": "not_found", "memory_id": memory_id}

        text = " ".join(
            part for part in [mem.title or "", mem.content or ""] if part
        ).strip()
        provider = os.getenv("EMBEDDING_PROVIDER", "local").strip().lower()
        if provider == "ollama":
            model = os.getenv("OLLAMA_EMBED_MODEL", model).strip() or model
        vector = compute_embedding(text, model=model)
        mem.search_vector = vector
        mem.embedding_vector = vector
        mem.hilbert_index = compute_hilbert_index(vector)

        from sqlalchemy import select
        row = (
            await session.execute(
                select(MemoryEmbedding).where(MemoryEmbedding.memory_id == memory_id).limit(1)
            )
        ).scalar_one_or_none() or MemoryEmbedding(memory_id=memory_id)
        row.model = model
        row.model_name = model
        row.model_version = os.getenv("EMBEDDING_MODEL_VERSION", "v1").strip() or "v1"
        row.confidence = 1.0
        row.dims = len(vector)
        row.metadata_json = {
            "provider": provider,
            "updated_by": "worker",
        }
        row.updated_at = datetime.now(timezone.utc)
        session.add(row)
        return {"status": "ok", "memory_id": memory_id, "dims": len(vector)}

    result = asyncio.run(_run_in_db(_upsert))
    logger.info("[worker] compute_memory_embedding complete memory_id=%s result=%s", memory_id, result)
    return result
