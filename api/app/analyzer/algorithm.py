"""ContextCache ranking algorithm adapter.

Production uses the private ``contextcache-engine`` package. When that
package is unavailable in local development or CI, expose a deterministic
fallback implementation that preserves the public API contract.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

from sqlalchemy import Float, bindparam, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Memory

logger = logging.getLogger(__name__)


try:  # pragma: no cover - covered when private engine is installed
    from contextcache_engine.algorithm import (  # type: ignore[import-untyped]
        HybridRecallConfig,
        HybridWeights,
        build_vector_candidate_stmt,
        compute_embedding,
        compute_hilbert_index,
        fetch_memories_by_ids,
        merge_hybrid_scores,
        normalize_positive,
        recency_boost,
        run_hybrid_rag_recall,
        score_memories_local,
        token_overlap_score,
        tokenize,
        _build_pack,
    )
except ModuleNotFoundError:  # pragma: no cover - exercised via integration paths
    logger.warning(
        "Private contextcache-engine package is unavailable; using local ranking fallback."
    )

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
        overlap = len(query_set & text_set)
        return overlap / max(len(query_set), 1)

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
        now = now or datetime.now(timezone.utc)
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

    def compute_embedding(text: str, *args: Any, **kwargs: Any) -> list[float]:
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

    def compute_hilbert_index(vector: Sequence[float] | None) -> int | None:
        if not vector:
            return None
        folded = 0
        for idx, value in enumerate(vector[:16], start=1):
            folded ^= int((value + 1.0) * 10_000 * idx)
        return abs((folded * 1_000_003) ^ DEFAULT_HILBERT_SEED)

    async def fetch_memories_by_ids(db: AsyncSession, memory_ids: Sequence[int]) -> list[Memory]:
        if not memory_ids:
            return []
        rows = (
            await db.execute(select(Memory).where(Memory.id.in_(list(memory_ids))))
        ).scalars().all()
        by_id = {memory.id: memory for memory in rows}
        return [by_id[memory_id] for memory_id in memory_ids if memory_id in by_id]

    def _cosine_similarity(a: Sequence[float] | None, b: Sequence[float] | None) -> float:
        if not a or not b:
            return 0.0
        length = min(len(a), len(b))
        if length == 0:
            return 0.0
        dot = sum(float(a[i]) * float(b[i]) for i in range(length))
        mag_a = math.sqrt(sum(float(a[i]) * float(a[i]) for i in range(length)))
        mag_b = math.sqrt(sum(float(b[i]) * float(b[i]) for i in range(length)))
        if mag_a == 0 or mag_b == 0:
            return 0.0
        return max(0.0, dot / (mag_a * mag_b))

    def _memory_text(memory: Memory) -> str:
        return " ".join(part for part in [memory.title or "", memory.content or ""] if part).strip()

    def score_memories_local(
        query: str,
        memories: Sequence[Memory],
        *,
        weights: HybridWeights | None = None,
    ) -> list[tuple[Memory, float]]:
        if not memories:
            return []
        weights = weights or HybridWeights()
        query_tokens = tokenize(query)
        query_embedding = compute_embedding(query)
        token_scores = [token_overlap_score(query_tokens, _memory_text(memory)) for memory in memories]
        vector_scores = [_cosine_similarity(query_embedding, memory.embedding_vector or memory.search_vector) for memory in memories]
        recency_scores = [recency_boost(memory.created_at) for memory in memories]
        merged = merge_hybrid_scores(
            token_scores=normalize_positive(token_scores),
            vector_scores=normalize_positive(vector_scores),
            recency_scores=normalize_positive(recency_scores),
            weights=weights,
        )
        ranked = list(zip(memories, merged))
        ranked.sort(key=lambda item: (item[1], item[0].created_at or datetime.min.replace(tzinfo=timezone.utc), item[0].id), reverse=True)
        return ranked

    async def run_hybrid_rag_recall(
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
                "score_details": {"reason": "no_memories"},
            }

        query_tokens = tokenize(query_text)
        lexical_matches = [
            memory for memory in memories if token_overlap_score(query_tokens, _memory_text(memory)) > 0
        ]
        if not lexical_matches:
            recent = memories[:limit]
            return {
                "strategy": "recency",
                "input_ids": [memory.id for memory in memories],
                "ranked_ids": [memory.id for memory in recent],
                "scores": {},
                "score_details": {"reason": "no_hybrid_match"},
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
            "score_details": {"reason": "no_hybrid_match"},
        }

    def build_vector_candidate_stmt(
        *,
        project_id: int,
        query_vector: Sequence[float],
        vector_candidates: int,
        use_hilbert: bool = False,
        hilbert_window: int = 5_000_000,
    ):
        stmt = select(Memory.id).where(
            Memory.project_id == project_id,
            Memory.embedding_vector.is_not(None),
        )
        if use_hilbert:
            query_hilbert = compute_hilbert_index(query_vector)
            if query_hilbert is not None:
                stmt = stmt.where(
                    Memory.hilbert_index.is_not(None),
                    Memory.hilbert_index >= query_hilbert - hilbert_window,
                    Memory.hilbert_index <= query_hilbert + hilbert_window,
                )
        vector_param = bindparam(
            "query_vector",
            list(query_vector),
            type_=ARRAY(Float()),
        )
        return stmt.order_by(Memory.embedding_vector.op("<=>")(vector_param)).limit(vector_candidates)

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
