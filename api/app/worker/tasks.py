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

# ---------------------------------------------------------------------------
# LLM Refinery — Gemini 1.5 Flash extraction
# ---------------------------------------------------------------------------

_GEMINI_SYSTEM_PROMPT = """You are an expert Data Engineer for a project memory tool.

Analyze the input text. Extract distinct, high-value insights.

Classify them as: DECISION, FINDING, TODO, CODE, or NOTE.

Strictly output valid JSON (a list of objects) with exactly these keys:
  type            - one of: decision, finding, todo, code, note  (lowercase)
  title           - short, descriptive title (max 80 characters)
  content         - the full extracted insight (concise but complete)
  confidence_score - float 0.0–1.0 reflecting how clearly this was stated

Rules:
- Output ONLY the JSON array. No markdown fences, no commentary, no keys outside the schema.
- Each item must contain exactly one insight — do not combine multiple points.
- Ignore greetings, thanks, and conversational filler.
- If nothing meaningful is found, return an empty array: []
"""


def _gemini_fallback(text: str, reason: str) -> list[dict]:
    """Return a raw Note card so captured data is never silently lost."""
    return [
        {
            "type": "note",
            "title": "Raw capture (extraction failed)",
            "content": f"[Gemini extraction failed: {reason}]\n\n{text[:2000]}",
            "confidence_score": 0.4,
        }
    ]


_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


def refine_content_with_llm(payload: dict) -> list[dict]:
    """Extract structured memory drafts from a raw capture payload via Gemini.

    Uses the ``google-genai`` SDK (google-genai>=1.0).  Model is configurable
    via the GEMINI_MODEL env var (default: gemini-2.0-flash).

    Reads GOOGLE_API_KEY from the environment.  Falls back to a raw Note card
    if the API call fails or returns unparseable JSON — captured data is never
    silently discarded.

    Return schema (list of dicts):
        type             str   decision | finding | todo | code | note
        title            str   short headline
        content          str   full extracted insight
        confidence_score float 0.0–1.0
    """
    import json

    text: str = ""
    source: str = "unknown"
    if isinstance(payload, dict):
        text = (
            payload.get("text")
            or payload.get("content")
            or payload.get("body")
            or str(payload)
        )
        source = payload.get("source", "unknown")

    text = text.strip()
    if not text:
        logger.warning("[refinery] empty payload — skipping Gemini call")
        return []

    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    # Docker Compose env_file does NOT strip quotes — handle both cases
    if len(api_key) >= 2 and api_key[0] == api_key[-1] and api_key[0] in ('"', "'"):
        api_key = api_key[1:-1].strip()
    if not api_key:
        logger.error("[refinery] GOOGLE_API_KEY not set — falling back to raw note")
        return _gemini_fallback(text, "GOOGLE_API_KEY not configured")

    try:
        from google import genai  # noqa: PLC0415
        from google.genai import types  # noqa: PLC0415
    except ImportError:
        logger.error("[refinery] google-genai not installed — run: uv add google-genai")
        return _gemini_fallback(text, "google-genai package not installed")

    raw_json = ""
    try:
        client = genai.Client(api_key=api_key)

        user_prompt = f"Source: {source}\n\n---\n\n{text}"

        response = client.models.generate_content(
            model=_GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=_GEMINI_SYSTEM_PROMPT,
                temperature=0.2,
                max_output_tokens=2048,
            ),
        )

        raw_json = (response.text or "").strip()

        # Strip optional markdown fences the model sometimes adds
        if raw_json.startswith("```"):
            raw_json = raw_json.split("\n", 1)[-1]
            raw_json = raw_json.rsplit("```", 1)[0].strip()

        drafts: list[dict] = json.loads(raw_json)

        if not isinstance(drafts, list):
            raise ValueError(f"Expected a JSON array, got {type(drafts).__name__}")

        valid_types = {"decision", "finding", "todo", "code", "note"}
        cleaned: list[dict] = []
        for item in drafts:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("type", "note")).lower().strip()
            if item_type not in valid_types:
                item_type = "note"
            content = str(item.get("content", "")).strip()
            if not content:
                continue
            cleaned.append(
                {
                    "type": item_type,
                    "title": str(item.get("title", ""))[:500].strip() or content[:80],
                    "content": content,
                    "confidence_score": max(
                        0.0, min(1.0, float(item.get("confidence_score", 0.75)))
                    ),
                }
            )

        logger.info(
            "[refinery] Gemini extracted %d item(s) from %d chars via model=%s",
            len(cleaned),
            len(text),
            _GEMINI_MODEL,
        )
        return cleaned

    except json.JSONDecodeError as exc:
        logger.error(
            "[refinery] JSON parse failed: %s — raw response: %.300s", exc, raw_json
        )
        return _gemini_fallback(text, f"JSON parse error: {exc}")

    except Exception as exc:  # noqa: BLE001
        logger.error("[refinery] Gemini API call failed: %s", exc)
        return _gemini_fallback(text, str(exc))


# ---------------------------------------------------------------------------
# Task: process_raw_capture_task
# ---------------------------------------------------------------------------

@celery_app.task(
    name="contextcache.process_raw_capture_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def process_raw_capture_task(self, capture_id: int) -> dict:
    """Refinery worker: extract InboxItems from a RawCapture via LLM.

    Steps:
      1. Fetch the raw_captures row.
      2. Call refine_content_with_llm(payload) — currently a stub that returns
         mock drafts; swap in a real LLM call when ready.
      3. Insert InboxItem rows for each extracted draft (status='pending').
      4. Set raw_captures.processed_at = now().

    Safe: only the integer capture_id is passed through Celery; the
    actual payload is loaded fresh from the DB inside the task.
    """
    skipped = _skip_if_disabled("process_raw_capture_task")
    if skipped is not None:
        return skipped

    logger.info("[worker] process_raw_capture_task started capture_id=%s", capture_id)

    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.models import InboxItem, RawCapture

    async def _process(session):
        capture = await session.get(RawCapture, capture_id)
        if capture is None:
            logger.warning("[worker] process_raw_capture_task capture not found id=%s", capture_id)
            return {"status": "not_found", "capture_id": capture_id}

        if capture.processed_at is not None:
            logger.info("[worker] process_raw_capture_task already processed id=%s", capture_id)
            return {"status": "already_processed", "capture_id": capture_id}

        # Determine target project (required to create inbox items).
        project_id = capture.project_id
        if project_id is None:
            logger.warning(
                "[worker] process_raw_capture_task no project_id on capture id=%s — skipping",
                capture_id,
            )
            capture.processed_at = datetime.now(timezone.utc)
            return {"status": "skipped_no_project", "capture_id": capture_id}

        # LLM extraction (stub by default; real call goes here).
        try:
            drafts = refine_content_with_llm(capture.payload)
        except Exception as exc:
            logger.error(
                "[worker] process_raw_capture_task LLM extraction failed capture_id=%s: %s",
                capture_id,
                exc,
            )
            raise self.retry(exc=exc)

        inserted = 0
        for draft in drafts:
            suggested_type = str(draft.get("type", "note"))[:50]
            suggested_title = str(draft.get("title", ""))[:500] or None
            suggested_content = str(draft.get("content", "")).strip()
            confidence = float(draft.get("confidence_score", 0.8))

            if not suggested_content:
                continue

            item = InboxItem(
                project_id=project_id,
                raw_capture_id=capture_id,
                suggested_type=suggested_type,
                suggested_title=suggested_title,
                suggested_content=suggested_content,
                confidence_score=max(0.0, min(1.0, confidence)),
                status="pending",
            )
            session.add(item)
            inserted += 1

        capture.processed_at = datetime.now(timezone.utc)
        logger.info(
            "[worker] process_raw_capture_task complete capture_id=%s inserted=%s",
            capture_id,
            inserted,
        )
        return {"status": "ok", "capture_id": capture_id, "items_created": inserted}

    return asyncio.run(_run_in_db(_process))


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


# ---------------------------------------------------------------------------
# Task: retry_stale_raw_captures
# ---------------------------------------------------------------------------

@celery_app.task(name="contextcache.retry_stale_raw_captures", bind=True, max_retries=2)
def retry_stale_raw_captures(self, stale_minutes: int = 60) -> dict:
    """Re-enqueue raw_captures that were never processed (worker crash, no-op mode, etc.).

    Finds captures with processed_at IS NULL and captured_at older than
    stale_minutes, then re-submits process_raw_capture_task for each.
    Safe to run hourly via Celery Beat.
    """
    skipped = _skip_if_disabled("retry_stale_raw_captures")
    if skipped is not None:
        return skipped

    logger.info("[worker] retry_stale_raw_captures started stale_minutes=%s", stale_minutes)

    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.models import RawCapture

    async def _find_stale(session):
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=int(stale_minutes))
        rows = (
            await session.execute(
                select(RawCapture.id)
                .where(
                    RawCapture.processed_at.is_(None),
                    RawCapture.captured_at < cutoff,
                )
                .limit(100)
            )
        ).scalars().all()
        return list(rows)

    try:
        stale_ids = asyncio.run(_run_in_db(_find_stale))
    except Exception as exc:
        logger.warning("[worker] retry_stale_raw_captures query failed: %s", exc)
        return {"status": "error", "detail": str(exc)}

    requeued = 0
    for capture_id in stale_ids:
        process_raw_capture_task.delay(capture_id)
        requeued += 1

    logger.info("[worker] retry_stale_raw_captures requeued=%s", requeued)
    return {"status": "ok", "requeued": requeued}
