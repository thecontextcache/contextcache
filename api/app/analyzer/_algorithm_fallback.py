"""Generic public-safe analyzer fallback.

This module preserves the public analyzer contract for local development and CI
without embedding private engine implementation details in the public repo.
The private engine boundary lives in ``app.analyzer.algorithm``.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Mapping, Sequence

from sqlalchemy import Float, bindparam, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Memory

logger = logging.getLogger(__name__)

TOKEN_RE = re.compile(r"[a-z0-9_]{2,}", re.IGNORECASE)
DEFAULT_EMBEDDING_DIMS = max(32, int(os.getenv("EMBEDDING_DIMS", "1536")))
DEFAULT_HILBERT_SEED = int(os.getenv("HILBERT_SEED", "1337"))
LOCAL_RECALL_FALLBACK_MAX_MEMORIES = max(
    1,
    int(os.getenv("LOCAL_RECALL_FALLBACK_MAX_MEMORIES", "500")),
)
PRIVATE_ENGINE_FAILURE_COOLDOWN_SECONDS = max(
    1,
    int(os.getenv("PRIVATE_ENGINE_FAILURE_COOLDOWN_SECONDS", "60")),
)


@dataclass(frozen=True)
class HybridWeights:
    fts: float = 0.65
    vector: float = 0.25
    recency: float = 0.10


@dataclass(frozen=True)
class HybridRecallConfig:
    fts_weight: float = 0.65
    vector_weight: float = 0.25
    recency_weight: float = 0.10
    vector_min_score: float = 0.20
    vector_candidates: int = 200
    use_hilbert: bool = False
    hilbert_window: int = 5_000_000


_private_run_hybrid_rag_recall = None
_private_engine_circuit_open_until: datetime | None = None
_private_engine_last_error_at: datetime | None = None
_private_engine_last_error_type: str | None = None


class RecallEngineUnavailableError(RuntimeError):
    """Raised when a configured private recall engine is currently unavailable."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _sequence_values(vector: Sequence[float] | None) -> list[float]:
    if vector is None or isinstance(vector, (str, bytes, bytearray)):
        return []
    try:
        return [float(value) for value in vector]
    except TypeError:
        return []


def _memory_get(memory: Memory | Mapping[str, Any], key: str, default: Any = None) -> Any:
    if isinstance(memory, Mapping):
        return memory.get(key, default)
    return getattr(memory, key, default)


def _memory_id(memory: Memory | Mapping[str, Any]) -> int | None:
    value = _memory_get(memory, "id")
    return int(value) if value is not None else None


def _memory_created_at(memory: Memory | Mapping[str, Any]) -> datetime | None:
    value = _memory_get(memory, "created_at")
    return value if isinstance(value, datetime) else None


def _memory_text(memory: Memory | Mapping[str, Any]) -> str:
    return " ".join(
        part
        for part in [
            str(_memory_get(memory, "title", "") or ""),
            str(_memory_get(memory, "content", "") or ""),
        ]
        if part
    ).strip()


def _memory_vector(memory: Memory | Mapping[str, Any]) -> Sequence[float] | None:
    embedding = _memory_get(memory, "embedding_vector")
    if embedding is not None:
        return embedding
    return _memory_get(memory, "search_vector")


def _circuit_is_open(now: datetime | None = None) -> bool:
    now = now or _utc_now()
    return _private_engine_circuit_open_until is not None and now < _private_engine_circuit_open_until


def _mark_private_engine_failure(exc: Exception) -> None:
    global _private_engine_circuit_open_until, _private_engine_last_error_at, _private_engine_last_error_type
    now = _utc_now()
    _private_engine_last_error_at = now
    _private_engine_last_error_type = type(exc).__name__
    _private_engine_circuit_open_until = now + timedelta(seconds=PRIVATE_ENGINE_FAILURE_COOLDOWN_SECONDS)


def _clear_private_engine_circuit() -> None:
    global _private_engine_circuit_open_until
    _private_engine_circuit_open_until = None


def reset_private_engine_runtime_state() -> None:
    global _private_engine_circuit_open_until, _private_engine_last_error_at, _private_engine_last_error_type
    _private_engine_circuit_open_until = None
    _private_engine_last_error_at = None
    _private_engine_last_error_type = None


def get_private_engine_runtime_state() -> dict[str, Any]:
    configured = _private_run_hybrid_rag_recall is not None
    circuit_open = _circuit_is_open()
    if not configured:
        mode = "local_fallback_only"
    elif circuit_open:
        mode = "circuit_open"
    else:
        mode = "private_engine"
    return {
        "configured": configured,
        "mode": mode,
        "circuit_open": circuit_open,
        "circuit_open_until": _private_engine_circuit_open_until,
        "last_error_at": _private_engine_last_error_at,
        "last_error_type": _private_engine_last_error_type,
        "cooldown_seconds": PRIVATE_ENGINE_FAILURE_COOLDOWN_SECONDS,
        "fallback_max_memories": LOCAL_RECALL_FALLBACK_MAX_MEMORIES,
    }


def tokenize(text: str | None) -> list[str]:
    if not text:
        return []
    return [match.group(0).lower() for match in TOKEN_RE.finditer(text)]


def token_overlap_score(query: str | Sequence[str], text: str | Sequence[str]) -> float:
    query_tokens = query if not isinstance(query, str) else tokenize(query)
    text_tokens = text if not isinstance(text, str) else tokenize(text)
    query_set = set(query_tokens)
    text_set = set(text_tokens)
    if not query_set or not text_set:
        return 0.0
    return len(query_set & text_set) / max(len(query_set), 1)


def normalize_positive(values: Sequence[float]) -> list[float]:
    if not values:
        return []
    max_value = max(values)
    if max_value <= 0:
        return [0.0 for _ in values]
    return [max(value, 0.0) / max_value for value in values]


def recency_boost(created_at: datetime | None, now: datetime | None = None) -> float:
    if created_at is None:
        return 0.0
    now = now or _utc_now()
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_hours = max((now - created_at).total_seconds() / 3600.0, 0.0)
    return math.exp(-age_hours / (24.0 * 14.0))


def merge_hybrid_scores(
    *,
    token_scores: Sequence[float],
    vector_scores: Sequence[float],
    recency_scores: Sequence[float],
    weights: HybridWeights,
) -> list[float]:
    return [
        (weights.fts * token_score)
        + (weights.vector * vector_score)
        + (weights.recency * recency_score)
        for token_score, vector_score, recency_score in zip(token_scores, vector_scores, recency_scores)
    ]


def compute_embedding(text: str, *args: Any, **kwargs: Any) -> list[float]:
    del args, kwargs
    payload = (text or "").encode("utf-8")
    if not payload:
        return [0.0] * DEFAULT_EMBEDDING_DIMS

    vector: list[float] = []
    counter = 0
    while len(vector) < DEFAULT_EMBEDDING_DIMS:
        digest = hashlib.sha256(payload + counter.to_bytes(4, "big")).digest()
        for idx in range(0, len(digest), 2):
            if len(vector) >= DEFAULT_EMBEDDING_DIMS:
                break
            chunk = int.from_bytes(digest[idx : idx + 2], "big")
            vector.append((chunk / 65535.0) * 2.0 - 1.0)
        counter += 1
    return vector


def compute_hilbert_index(vector: Sequence[float] | None):
    values = _sequence_values(vector)
    if not values:
        return None
    folded = 0
    for idx, value in enumerate(values[:16], start=1):
        folded ^= int((value + 1.0) * 10_000 * idx)
    return abs((folded * 1_000_003) ^ DEFAULT_HILBERT_SEED)


async def fetch_memories_by_ids(db: AsyncSession, memory_ids: Sequence[int]) -> list[Memory]:
    if not memory_ids:
        return []
    rows = (await db.execute(select(Memory).where(Memory.id.in_(list(memory_ids))))).scalars().all()
    by_id = {memory.id: memory for memory in rows}
    return [by_id[memory_id] for memory_id in memory_ids if memory_id in by_id]


def _cosine_similarity(a: Sequence[float] | None, b: Sequence[float] | None) -> float:
    left = _sequence_values(a)
    right = _sequence_values(b)
    length = min(len(left), len(right))
    if length == 0:
        return 0.0
    dot = sum(left[i] * right[i] for i in range(length))
    mag_left = math.sqrt(sum(left[i] * left[i] for i in range(length)))
    mag_right = math.sqrt(sum(right[i] * right[i] for i in range(length)))
    if mag_left == 0 or mag_right == 0:
        return 0.0
    return max(0.0, dot / (mag_left * mag_right))


def score_memories_local(
    query: str,
    memories,
    *,
    weights: HybridWeights | None = None,
    limit: int | None = None,
):
    if not memories:
        return []

    weights = weights or HybridWeights()
    query_tokens = tokenize(query)
    query_embedding = compute_embedding(query)
    token_scores = [token_overlap_score(query_tokens, _memory_text(memory)) for memory in memories]
    vector_scores = [_cosine_similarity(query_embedding, _memory_vector(memory)) for memory in memories]
    recency_scores = [recency_boost(_memory_created_at(memory)) for memory in memories]
    merged = merge_hybrid_scores(
        token_scores=normalize_positive(token_scores),
        vector_scores=normalize_positive(vector_scores),
        recency_scores=normalize_positive(recency_scores),
        weights=weights,
    )

    ranked_pairs = list(zip(memories, merged))
    ranked_pairs.sort(
        key=lambda item: (
            item[1],
            _memory_created_at(item[0]) or datetime.min.replace(tzinfo=timezone.utc),
            _memory_id(item[0]) or 0,
        ),
        reverse=True,
    )
    if limit is not None:
        ranked_pairs = ranked_pairs[:limit]

    first = ranked_pairs[0][0]
    if isinstance(first, Mapping):
        ranked_rows: list[dict[str, Any]] = []
        for memory, score in ranked_pairs:
            row = dict(memory)
            row["rank_score"] = round(score, 6)
            ranked_rows.append(row)
        return ranked_rows
    return ranked_pairs


async def _run_hybrid_rag_recall_local(
    db: AsyncSession,
    *,
    project_id: int,
    query_text: str,
    limit: int,
    config: HybridRecallConfig | None = None,
) -> dict[str, Any]:
    config = config or HybridRecallConfig()
    memories = (
        await db.execute(
            select(Memory)
            .where(Memory.project_id == project_id)
            .order_by(Memory.created_at.desc(), Memory.id.desc())
            .limit(LOCAL_RECALL_FALLBACK_MAX_MEMORIES)
        )
    ).scalars().all()

    base_score_details = {
        "source": "generic-public-fallback",
        "candidate_count": len(memories),
        "fallback_max_memories": LOCAL_RECALL_FALLBACK_MAX_MEMORIES,
    }
    if not memories:
        return {
            "strategy": "recency",
            "input_ids": [],
            "ranked_ids": [],
            "scores": {},
            "score_details": {**base_score_details, "reason": "no_memories"},
        }

    ranked = score_memories_local(
        query_text,
        memories,
        weights=HybridWeights(
            fts=config.fts_weight,
            vector=config.vector_weight,
            recency=config.recency_weight,
        ),
    )
    positive = [(memory, score) for memory, score in ranked if score > 0]
    if positive:
        top = positive[:limit]
        return {
            "strategy": "hybrid",
            "input_ids": [memory.id for memory in memories],
            "ranked_ids": [memory.id for memory, _ in top],
            "scores": {memory.id: round(score, 6) for memory, score in top},
            "score_details": {
                **base_score_details,
                "weights": {
                    "fts": config.fts_weight,
                    "vector": config.vector_weight,
                    "recency": config.recency_weight,
                },
            },
        }

    recent = memories[:limit]
    return {
        "strategy": "recency",
        "input_ids": [memory.id for memory in memories],
        "ranked_ids": [memory.id for memory in recent],
        "scores": {},
        "score_details": {**base_score_details, "reason": "no_hybrid_match"},
    }


def build_vector_candidate_stmt(
    *,
    project_id: int,
    query_vector: Sequence[float],
    vector_candidates: int,
    use_hilbert: bool = False,
    hilbert_window: int = 5_000_000,
    query_hilbert: int | None = None,
):
    stmt = select(Memory.id).where(
        Memory.project_id == project_id,
        Memory.embedding_vector.is_not(None),
    )
    if use_hilbert:
        resolved_hilbert = query_hilbert
        if resolved_hilbert is None:
            resolved_hilbert = compute_hilbert_index(query_vector)
        if resolved_hilbert is not None:
            stmt = stmt.where(
                Memory.hilbert_index.is_not(None),
                Memory.hilbert_index >= resolved_hilbert - hilbert_window,
                Memory.hilbert_index <= resolved_hilbert + hilbert_window,
            )

    vector_param = bindparam("query_vector", list(query_vector), type_=ARRAY(Float()))
    return stmt.order_by(Memory.embedding_vector.op("<=>")(vector_param)).limit(vector_candidates)


async def run_hybrid_rag_recall(
    db: AsyncSession,
    *,
    project_id: int,
    query_text: str,
    limit: int,
    config: HybridRecallConfig | None = None,
) -> dict[str, Any]:
    if _private_run_hybrid_rag_recall is not None:
        if _circuit_is_open():
            raise RecallEngineUnavailableError("Recall engine temporarily unavailable")
        try:
            result = await _private_run_hybrid_rag_recall(
                db,
                project_id=project_id,
                query_text=query_text,
                limit=limit,
                config=config,
            )
        except Exception as exc:
            _mark_private_engine_failure(exc)
            logger.exception(
                "Private recall engine failed; opening circuit and refusing degraded fallback.",
                extra={
                    "project_id": project_id,
                    "limit": limit,
                    "cooldown_seconds": PRIVATE_ENGINE_FAILURE_COOLDOWN_SECONDS,
                    "error_type": type(exc).__name__,
                },
            )
            raise RecallEngineUnavailableError("Recall engine temporarily unavailable") from exc
        _clear_private_engine_circuit()
        return result

    return await _run_hybrid_rag_recall_local(
        db,
        project_id=project_id,
        query_text=query_text,
        limit=limit,
        config=config,
    )


def _build_pack(query: str, items: Iterable[tuple[str, str]]) -> str:
    grouped: dict[str, list[str]] = {}
    ordered_types: list[str] = []
    for memory_type, content in items:
        key = (memory_type or "note").upper()
        if key not in grouped:
            grouped[key] = []
            ordered_types.append(key)
        grouped[key].append((content or "").strip())

    if not ordered_types:
        return f"PROJECT MEMORY PACK\nQuery: {query or '(empty)'}\n\n(no memories)"

    lines = ["PROJECT MEMORY PACK", f"Query: {query or '(empty)'}"]
    for memory_type in ordered_types:
        lines.append("")
        lines.append(f"{memory_type}:")
        for content in grouped[memory_type]:
            lines.append(f"- {content}")
    return "\n".join(lines)


__all__ = [
    "HybridRecallConfig",
    "HybridWeights",
    "RecallEngineUnavailableError",
    "_build_pack",
    "build_vector_candidate_stmt",
    "compute_embedding",
    "compute_hilbert_index",
    "fetch_memories_by_ids",
    "get_private_engine_runtime_state",
    "merge_hybrid_scores",
    "normalize_positive",
    "recency_boost",
    "reset_private_engine_runtime_state",
    "run_hybrid_rag_recall",
    "score_memories_local",
    "token_overlap_score",
    "tokenize",
]
