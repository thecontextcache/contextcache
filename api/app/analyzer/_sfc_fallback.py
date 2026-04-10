"""Hilbert space-filling curve — proprietary engine.

The projection, quantization, and Hilbert index logic is loaded from
the private contextcache-engine package at runtime.

© 2024-2026 Nikhil Dodda / TheContextCache. All rights reserved.
"""
from __future__ import annotations

import logging
import os
from typing import Sequence

logger = logging.getLogger(__name__)

try:  # pragma: no cover - exercised when the private engine is installed
    from contextcache_engine.sfc import (  # type: ignore[import-untyped]
        HILBERT_ENABLED,
        HILBERT_DIMS,
        HILBERT_BITS,
        HILBERT_RADIUS,
        HILBERT_MIN_ROWS,
        HILBERT_MAX_RADIUS,
        HILBERT_WIDEN_MULT,
        hilbert_index_from_embedding,
        project_embedding,
        quantize,
    )
except ModuleNotFoundError:  # pragma: no cover - integration-focused fallback
    logger.warning(
        "Private contextcache-engine package is unavailable; using local Hilbert fallback."
    )

    HILBERT_ENABLED = os.getenv("HILBERT_ENABLED", "false").strip().lower() == "true"
    HILBERT_DIMS = int(os.getenv("HILBERT_DIMS", "8"))
    HILBERT_BITS = int(os.getenv("HILBERT_BITS", "8"))
    HILBERT_RADIUS = int(os.getenv("HILBERT_RADIUS", "4096"))
    HILBERT_MIN_ROWS = int(os.getenv("HILBERT_MIN_ROWS", "64"))
    HILBERT_MAX_RADIUS = int(os.getenv("HILBERT_MAX_RADIUS", "131072"))
    HILBERT_WIDEN_MULT = float(os.getenv("HILBERT_WIDEN_MULT", "1.5"))

    def project_embedding(vector: Sequence[float] | None) -> list[float]:
        if not vector:
            return [0.0] * HILBERT_DIMS
        projected = [float(value) for value in vector[:HILBERT_DIMS]]
        if len(projected) < HILBERT_DIMS:
            projected.extend([0.0] * (HILBERT_DIMS - len(projected)))
        return projected

    def quantize(vector: Sequence[float] | None, bits: int = HILBERT_BITS) -> list[int]:
        if not vector:
            return [0] * HILBERT_DIMS
        max_bucket = max((1 << max(bits, 1)) - 1, 1)
        buckets: list[int] = []
        for value in project_embedding(vector):
            normalized = max(min((float(value) + 1.0) / 2.0, 1.0), 0.0)
            buckets.append(int(round(normalized * max_bucket)))
        return buckets

    def hilbert_index_from_embedding(vector: Sequence[float] | None) -> int | None:
        if not vector:
            return None
        from app.analyzer.algorithm import compute_hilbert_index

        return compute_hilbert_index(project_embedding(vector))

__all__ = [
    "HILBERT_ENABLED",
    "HILBERT_DIMS",
    "HILBERT_BITS",
    "HILBERT_RADIUS",
    "HILBERT_MIN_ROWS",
    "HILBERT_MAX_RADIUS",
    "HILBERT_WIDEN_MULT",
    "hilbert_index_from_embedding",
    "project_embedding",
    "quantize",
]
