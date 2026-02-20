"""Backward-compatible shim for analyzer logic.

All algorithm implementation now lives in `app.analyzer.algorithm`.
Keep this module as a thin re-export to avoid breaking legacy imports.
"""
from __future__ import annotations

from .algorithm import (
    HybridRecallConfig,
    HybridWeights,
    _build_pack,
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
)

__all__ = [
    "HybridRecallConfig",
    "HybridWeights",
    "_build_pack",
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
]
