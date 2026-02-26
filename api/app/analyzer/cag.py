"""CAG (Cache-Augmented Generation) — proprietary engine.

The ACO pheromone cache, evaporation, eviction, and KV-cache logic is
loaded from the private contextcache-engine package at runtime.

© 2024-2026 Nikhil Dodda / TheContextCache. All rights reserved.
"""
from contextcache_engine.cag import (  # type: ignore[import-untyped]
    CAG_ENABLED,
    CAG_MATCH_THRESHOLD,
    CAG_MODE,
    CAG_EMBEDDING_MODEL_NAME,
    CAG_EMBEDDING_DIMS,
    CAGAnswer,
    CAGChunk,
    evaporate_pheromones,
    evaporation_interval_seconds,
    get_cag_cache_stats,
    is_local_cag,
    maybe_answer_from_cache,
    maybe_evaporate_due,
    promote_cag_chunk,
    warm_cag_cache,
)

__all__ = [
    "CAG_ENABLED",
    "CAG_MATCH_THRESHOLD",
    "CAG_MODE",
    "CAG_EMBEDDING_MODEL_NAME",
    "CAG_EMBEDDING_DIMS",
    "CAGAnswer",
    "CAGChunk",
    "evaporate_pheromones",
    "evaporation_interval_seconds",
    "get_cag_cache_stats",
    "is_local_cag",
    "maybe_answer_from_cache",
    "maybe_evaporate_due",
    "promote_cag_chunk",
    "warm_cag_cache",
]