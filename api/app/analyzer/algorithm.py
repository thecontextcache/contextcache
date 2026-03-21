"""ContextCache ranking algorithm adapter.

Production prefers the private ``contextcache-engine`` package. When that
package is unavailable, or when it raises during recall, this module falls
back to a deterministic local implementation that preserves the public API
contract.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping, Sequence

from sqlalchemy import Float, bindparam, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Memory

logger = logging.getLogger(__name__)

TOKEN_RE = re.compile(r"[a-z0-9_]{2,}", re.IGNORECASE)
DEFAULT_EMBEDDING_DIMS = int(os.getenv("EMBEDDING_DIMS", "1536"))
DEFAULT_HILBERT_SEED = int(os.getenv("HILBERT_SEED", "1337"))


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


_private_build_vector_candidate_stmt = None
_private_compute_embedding = None
_private_compute_hilbert_index = None
_private_fetch_memories_by_ids = None
_private_merge_hybrid_scores = None
_private_normalize_positive = None
_private_recency_boost = None
_private_run_hybrid_rag_recall = None
_private_score_memories_local = None
_private_token_overlap_score = None
_private_tokenize = None
_private_build_pack = None

try:  # pragma: no cover - covered when the private engine is installed
    from contextcache_engine.algorithm import (  # type: ignore[import-untyped]
        _build_pack as _private_build_pack,
        build_vector_candidate_stmt as _private_build_vector_candidate_stmt,
        compute_embedding as _private_compute_embedding,
        compute_hilbert_index as _private_compute_hilbert_index,
        fetch_memories_by_ids as _private_fetch_memories_by_ids,
        merge_hybrid_scores as _private_merge_hybrid_scores,
        normalize_positive as _private_normalize_positive,
        recency_boost as _private_recency_boost,
        run_hybrid_rag_recall as _private_run_hybrid_rag_recall,
        score_memories_local as _private_score_memories_local,
        token_overlap_score as _private_token_overlap_score,
        tokenize as _private_tokenize,
    )
except ModuleNotFoundError:  # pragma: no cover - exercised via integration paths
    logger.warning(
        "Private contextcache-engine package is unavailable; using local ranking fallback."
    )
except Exception:  # pragma: no cover - defensive import guard
    logger.exception(
        "Private contextcache-engine package failed to import; using local ranking fallback."
    )


def _sequence_values(vector: Sequence[float] | None) -> list[float]:
    if vector is None:
        return []
    if isinstance(vector, (str, bytes, bytearray)):
        return []
    try:
        return [float(value) for value in vector]
    except TypeError:
        return []


def _memory_get(memory: Memory | Mapping[str, Any], key: str, default: Any = None) -> Any:
    if isinstance(memory, Mapping):
        return memory.get(key, default)
    return getattr(memory, key, default)


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


def _memory_created_at(memory: Memory | Mapping[str, Any]) -> datetime | None:
    value = _memory_get(memory, "created_at")
    return value if isinstance(value, datetime) else None


def _memory_id(memory: Memory | Mapping[str, Any]) -> int | None:
    value = _memory_get(memory, "id")
    return int(value) if value is not None else None


def _tokenize_local(text: str | None) -> list[str]:
    if not text:
        return []
    return [match.group(0).lower() for match in TOKEN_RE.finditer(text)]


def _token_overlap_score_local(query: str | Sequence[str], text: str | Sequence[str]) -> float:
    query_tokens = query if not isinstance(query, str) else _tokenize_local(query)
    text_tokens = text if not isinstance(text, str) else _tokenize_local(text)
    query_set = set(query_tokens)
    text_set = set(text_tokens)
    if not query_set or not text_set:
        return 0.0
    overlap = len(query_set & text_set)
    return overlap / max(len(query_set), 1)


def _normalize_positive_local(values: Sequence[float]) -> list[float]:
    if not values:
        return []
    max_value = max(values)
    if max_value <= 0:
        return [0.0 for _ in values]
    return [max(value, 0.0) / max_value for value in values]


def _recency_boost_local(created_at: datetime | None, now: datetime | None = None) -> float:
    if created_at is None:
        return 0.0
    now = now or datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_hours = max((now - created_at).total_seconds() / 3600.0, 0.0)
    return math.exp(-age_hours / (24.0 * 14.0))


def _merge_hybrid_scores_local(
    *,
    token_scores: Sequence[float],
    vector_scores: Sequence[float],
    recency_scores: Sequence[float],
    weights: HybridWeights,
) -> list[float]:
    merged: list[float] = []
    for token_score, vector_score, recency_score in zip(token_scores, vector_scores, recency_scores):
        merged.append(
            (weights.fts * token_score)
            + (weights.vector * vector_score)
            + (weights.recency * recency_score)
        )
    return merged


def _embedding_dimensions() -> int:
    return max(DEFAULT_EMBEDDING_DIMS, 32)


def _compute_embedding_local(text: str, *args: Any, **kwargs: Any) -> list[float]:
    dims = _embedding_dimensions()
    payload = (text or "").encode("utf-8")
    if not payload:
        return [0.0] * dims

    vector: list[float] = []
    counter = 0
    while len(vector) < dims:
        digest = hashlib.sha256(payload + counter.to_bytes(4, "big")).digest()
        for idx in range(0, len(digest), 2):
            if len(vector) >= dims:
                break
            chunk = int.from_bytes(digest[idx : idx + 2], "big")
            vector.append((chunk / 65535.0) * 2.0 - 1.0)
        counter += 1
    return vector


def _compute_hilbert_index_local(vector: Sequence[float] | None) -> int | None:
    values = _sequence_values(vector)
    if not values:
        return None
    folded = 0
    for idx, value in enumerate(values[:16], start=1):
        folded ^= int((value + 1.0) * 10_000 * idx)
    return abs((folded * 1_000_003) ^ DEFAULT_HILBERT_SEED)


async def _fetch_memories_by_ids_local(db: AsyncSession, memory_ids: Sequence[int]) -> list[Memory]:
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


def _score_memories_local(
    query: str,
    memories: Sequence[Memory] | Sequence[Mapping[str, Any]],
    *,
    weights: HybridWeights | None = None,
    limit: int | None = None,
):
    if not memories:
        return []
    weights = weights or HybridWeights()
    query_tokens = _tokenize_local(query)
    query_embedding = _compute_embedding_local(query)
    token_scores = [_token_overlap_score_local(query_tokens, _memory_text(memory)) for memory in memories]
    vector_scores = [_cosine_similarity(query_embedding, _memory_vector(memory)) for memory in memories]
    recency_scores = [_recency_boost_local(_memory_created_at(memory)) for memory in memories]
    merged = _merge_hybrid_scores_local(
        token_scores=_normalize_positive_local(token_scores),
        vector_scores=_normalize_positive_local(vector_scores),
        recency_scores=_normalize_positive_local(recency_scores),
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
        )
    ).scalars().all()

    if not memories:
        return {
            "strategy": "recency",
            "input_ids": [],
            "ranked_ids": [],
            "scores": {},
            "score_details": {"reason": "no_memories", "source": "local-fallback"},
        }

    query_tokens = _tokenize_local(query_text)
    lexical_matches = [
        memory for memory in memories if _token_overlap_score_local(query_tokens, _memory_text(memory)) > 0
    ]
    if not lexical_matches:
        recent = memories[:limit]
        return {
            "strategy": "recency",
            "input_ids": [memory.id for memory in memories],
            "ranked_ids": [memory.id for memory in recent],
            "scores": {},
            "score_details": {"reason": "no_hybrid_match", "source": "local-fallback"},
        }

    ranked = _score_memories_local(
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
                "source": "local-fallback",
                "weights": {
                    "fts": config.fts_weight,
                    "vector": config.vector_weight,
                    "recency": config.recency_weight,
                },
            },
        }

    recent = lexical_matches[:limit]
    return {
        "strategy": "recency",
        "input_ids": [memory.id for memory in memories],
        "ranked_ids": [memory.id for memory in recent],
        "scores": {},
        "score_details": {"reason": "no_hybrid_match", "source": "local-fallback"},
    }


def _build_vector_candidate_stmt_local(
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
            resolved_hilbert = _compute_hilbert_index_local(query_vector)
        if resolved_hilbert is not None:
            stmt = stmt.where(
                Memory.hilbert_index.is_not(None),
                Memory.hilbert_index >= resolved_hilbert - hilbert_window,
                Memory.hilbert_index <= resolved_hilbert + hilbert_window,
            )
    vector_param = bindparam(
        "query_vector",
        list(query_vector),
        type_=ARRAY(Float()),
    )
    return stmt.order_by(Memory.embedding_vector.op("<=>")(vector_param)).limit(vector_candidates)


def _build_pack_local(query: str, items: Iterable[tuple[str, str]]) -> str:
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


def tokenize(text: str | None) -> list[str]:
    if _private_tokenize is not None:
        return _private_tokenize(text)
    return _tokenize_local(text)


def token_overlap_score(query: str | Sequence[str], text: str | Sequence[str]) -> float:
    if _private_token_overlap_score is not None:
        return _private_token_overlap_score(query, text)
    return _token_overlap_score_local(query, text)


def normalize_positive(values: Sequence[float]) -> list[float]:
    if _private_normalize_positive is not None:
        return _private_normalize_positive(values)
    return _normalize_positive_local(values)


def recency_boost(created_at: datetime | None, now: datetime | None = None) -> float:
    if _private_recency_boost is not None:
        return _private_recency_boost(created_at, now)
    return _recency_boost_local(created_at, now)


def merge_hybrid_scores(*, token_scores: Sequence[float], vector_scores: Sequence[float], recency_scores: Sequence[float], weights: HybridWeights):
    if _private_merge_hybrid_scores is not None:
        return _private_merge_hybrid_scores(
            token_scores=token_scores,
            vector_scores=vector_scores,
            recency_scores=recency_scores,
            weights=weights,
        )
    return _merge_hybrid_scores_local(
        token_scores=token_scores,
        vector_scores=vector_scores,
        recency_scores=recency_scores,
        weights=weights,
    )


def compute_embedding(text: str, *args: Any, **kwargs: Any):
    if _private_compute_embedding is not None:
        return _private_compute_embedding(text, *args, **kwargs)
    return _compute_embedding_local(text, *args, **kwargs)


def compute_hilbert_index(vector: Sequence[float] | None):
    if _private_compute_hilbert_index is not None:
        return _private_compute_hilbert_index(vector)
    return _compute_hilbert_index_local(vector)


async def fetch_memories_by_ids(db: AsyncSession, memory_ids: Sequence[int]) -> list[Memory]:
    if _private_fetch_memories_by_ids is not None:
        return await _private_fetch_memories_by_ids(db, memory_ids)
    return await _fetch_memories_by_ids_local(db, memory_ids)


def score_memories_local(query: str, memories, *, weights: HybridWeights | None = None, limit: int | None = None):
    if _private_score_memories_local is not None:
        kwargs: dict[str, Any] = {}
        if weights is not None:
            kwargs["weights"] = weights
        if limit is not None:
            kwargs["limit"] = limit
        return _private_score_memories_local(query, memories, **kwargs)
    return _score_memories_local(query, memories, weights=weights, limit=limit)


def build_vector_candidate_stmt(*, project_id: int, query_vector: Sequence[float], vector_candidates: int, use_hilbert: bool = False, hilbert_window: int = 5_000_000, query_hilbert: int | None = None):
    if _private_build_vector_candidate_stmt is not None:
        kwargs = {
            "project_id": project_id,
            "query_vector": query_vector,
            "vector_candidates": vector_candidates,
            "use_hilbert": use_hilbert,
            "hilbert_window": hilbert_window,
        }
        if query_hilbert is not None:
            kwargs["query_hilbert"] = query_hilbert
        return _private_build_vector_candidate_stmt(**kwargs)
    return _build_vector_candidate_stmt_local(
        project_id=project_id,
        query_vector=query_vector,
        vector_candidates=vector_candidates,
        use_hilbert=use_hilbert,
        hilbert_window=hilbert_window,
        query_hilbert=query_hilbert,
    )


async def run_hybrid_rag_recall(
    db: AsyncSession,
    *,
    project_id: int,
    query_text: str,
    limit: int,
    config: HybridRecallConfig | None = None,
) -> dict[str, Any]:
    if _private_run_hybrid_rag_recall is not None:
        try:
            return await _private_run_hybrid_rag_recall(
                db,
                project_id=project_id,
                query_text=query_text,
                limit=limit,
                config=config,
            )
        except Exception:
            logger.exception(
                "Private hybrid recall failed; using local ranking fallback.",
                extra={"project_id": project_id, "limit": limit},
            )

    return await _run_hybrid_rag_recall_local(
        db,
        project_id=project_id,
        query_text=query_text,
        limit=limit,
        config=config,
    )


def _build_pack(query: str, items: Iterable[tuple[str, str]]) -> str:
    if _private_build_pack is not None:
        return _private_build_pack(query, items)
    return _build_pack_local(query, items)


__all__ = [
    "HybridRecallConfig",
    "HybridWeights",
    "build_vector_candidate_stmt",
    "compute_embedding",
    "compute_hilbert_index",
    "fetch_memories_by_ids",
    "merge_hybrid_scores",
    "normalize_positive",
    "recency_boost",
    "run_hybrid_rag_recall",
    "score_memories_local",
    "token_overlap_score",
    "tokenize",
    "_build_pack",
]
