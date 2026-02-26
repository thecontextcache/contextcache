"""Hilbert space-filling curve — proprietary engine.

The projection, quantization, and Hilbert index logic is loaded from
the private contextcache-engine package at runtime.

© 2024-2026 Nikhil Dodda / TheContextCache. All rights reserved.
"""
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