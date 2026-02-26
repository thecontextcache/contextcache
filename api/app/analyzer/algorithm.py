"""ContextCache ranking algorithm — proprietary engine.

The scoring, ranking, embedding, and recall logic is loaded from the private
contextcache-engine package at runtime. This stub provides the public
interface so the rest of the codebase can import normally.

© 2024-2026 Nikhil Dodda / TheContextCache. All rights reserved.
Unauthorized use, disclosure, or distribution is strictly prohibited.
"""
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