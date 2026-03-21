"""CAG (Cache-Augmented Generation) adapter.

The proprietary cache engine lives in the private ``contextcache-engine``
package. For local development and CI paths where that package is not
installed, expose a read-safe fallback shim instead of crashing imports.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


try:  # pragma: no cover - exercised when the private engine is installed
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
except ModuleNotFoundError:  # pragma: no cover - shim is integration-focused
    logger.warning(
        "Private contextcache-engine package is unavailable; using local CAG fallback shim."
    )

    def _env_bool(name: str, default: str) -> bool:
        return os.getenv(name, default).strip().lower() == "true"

    CAG_ENABLED = _env_bool("CAG_ENABLED", "true")
    CAG_MATCH_THRESHOLD = float(os.getenv("CAG_MATCH_THRESHOLD", "0.58"))
    CAG_MODE = os.getenv("CAG_MODE", "local").strip() or "local"
    CAG_EMBEDDING_MODEL_NAME = (
        os.getenv("CAG_EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2").strip() or "all-MiniLM-L6-v2"
    )
    CAG_EMBEDDING_DIMS = int(os.getenv("CAG_EMBEDDING_DIMS", "384"))
    _CAG_CACHE_MAX_ITEMS = int(os.getenv("CAG_CACHE_MAX_ITEMS", "512"))
    _CAG_EVAPORATION = float(os.getenv("CAG_PHEROMONE_EVAPORATION", "0.95"))
    _CAG_EVAP_INTERVAL = int(os.getenv("CAG_EVAPORATION_INTERVAL_SECONDS", "600"))
    _CAG_KV_STUB_ENABLED = _env_bool("CAG_KV_STUB_ENABLED", "true")

    @dataclass(slots=True)
    class CAGChunk:
        source: str
        hit_count: int = 0
        pheromone_level: float = 1.0
        last_accessed_at: str | None = None

    @dataclass(slots=True)
    class CAGAnswer:
        source: str = "fallback"
        score: float = 0.0
        snippets: list[str] = field(default_factory=list)
        kv_cache_id: str | None = None
        memory_matrix: list[list[float]] | None = None

    def is_local_cag() -> bool:
        return CAG_MODE == "local"

    def maybe_answer_from_cache(_query: str) -> None:
        return None

    def warm_cag_cache() -> int:
        return 0

    def evaporation_interval_seconds() -> int:
        return _CAG_EVAP_INTERVAL if CAG_ENABLED else 0

    def evaporate_pheromones() -> dict[str, Any]:
        return {
            "items": 0,
            "evaporation_factor": _CAG_EVAPORATION,
            "last_evaporation_at": datetime.now(timezone.utc).isoformat(),
        }

    def maybe_evaporate_due() -> bool:
        return False

    def promote_cag_chunk(_chunk: CAGChunk) -> None:
        return None

    def get_cag_cache_stats() -> dict[str, Any]:
        return {
            "enabled": False,
            "mode": f"{CAG_MODE}-fallback",
            "embedding_model": CAG_EMBEDDING_MODEL_NAME,
            "cache_items": 0,
            "cache_max_items": _CAG_CACHE_MAX_ITEMS,
            "total_queries": 0,
            "total_hits": 0,
            "total_misses": 0,
            "hit_rate": 0.0,
            "total_evicted": 0,
            "avg_pheromone": 0.0,
            "last_evaporation_at": None,
            "evaporation_factor": _CAG_EVAPORATION,
            "evaporation_interval_seconds": evaporation_interval_seconds(),
            "kv_stub_enabled": _CAG_KV_STUB_ENABLED,
            "kv_token_budget_used": 0,
            "top_entries": [],
        }


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
