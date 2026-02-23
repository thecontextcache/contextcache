from __future__ import annotations

import math
import os
import random
from functools import lru_cache
from typing import Sequence

try:
    from hilbertcurve.hilbertcurve import HilbertCurve
except ImportError:
    HilbertCurve = None

# Config
HILBERT_ENABLED = os.getenv("HILBERT_ENABLED", "false").strip().lower() == "true"
HILBERT_DIMS = int(os.getenv("HILBERT_DIMS", "8"))
HILBERT_BITS = int(os.getenv("HILBERT_BITS", "12"))
HILBERT_SEED = int(os.getenv("HILBERT_SEED", "1337"))

HILBERT_RADIUS = int(os.getenv("HILBERT_RADIUS", "500000"))
HILBERT_PREFILTER_CANDIDATES = int(os.getenv("HILBERT_PREFILTER_CANDIDATES", "5000"))
HILBERT_MIN_ROWS = int(os.getenv("HILBERT_MIN_ROWS", "500"))
HILBERT_MAX_RADIUS = int(os.getenv("HILBERT_MAX_RADIUS", "5000000"))
HILBERT_WIDEN_MULT = float(os.getenv("HILBERT_WIDEN_MULT", "2.0"))


@lru_cache(maxsize=1)
def _get_hilbert_curve() -> "HilbertCurve" | None:
    if not HILBERT_ENABLED or HilbertCurve is None:
        return None
    return HilbertCurve(HILBERT_DIMS, HILBERT_BITS)


@lru_cache(maxsize=1)
def _get_projection_matrix(input_dim: int, output_dim: int, seed: int) -> list[list[float]]:
    """
    Generate a deterministic random Gaussian projection matrix.
    Rows: output_dim, Cols: input_dim
    """
    rng = random.Random(seed)
    matrix = []
    for _ in range(output_dim):
        row = []
        for _ in range(input_dim):
            # Box-Muller transform for normal distribution
            u1 = rng.random()
            u2 = rng.random()
            z0 = math.sqrt(-2.0 * math.log(max(u1, 1e-10))) * math.cos(2.0 * math.pi * u2)
            row.append(z0)
        
        # Normalize the row to maintain length (optional but helps stability)
        norm = math.sqrt(sum(x * x for x in row))
        if norm > 0:
            row = [x / norm for x in row]
        matrix.append(row)
    return matrix


def project_embedding(vec: Sequence[float]) -> list[float]:
    """
    Project high-dimensional embedding down to HILBERT_DIMS using a deterministic random matrix.
    """
    input_dim = len(vec)
    matrix = _get_projection_matrix(input_dim, HILBERT_DIMS, HILBERT_SEED)
    
    projected = []
    for row in matrix:
        dot_product = sum(r * v for r, v in zip(row, vec))
        projected.append(dot_product)
        
    return projected


def quantize(values: list[float], bits: int) -> list[int]:
    """
    Quantize float values approximately [-1, 1] into integers [0, 2^bits - 1].
    Values significantly outside [-1, 1] will be heavily clamped to the edges.
    """
    max_val = (1 << bits) - 1
    quantized = []
    for v in values:
        # Scale range [-1, 1] to [0, max_val]
        # (v + 1) / 2 transforms [-1, 1] to [0, 1]
        normalized = (v + 1.0) / 2.0
        
        # Clamp to [0, 1] to prevent overflow/underflow
        clamped = max(0.0, min(1.0, normalized))
        
        q = int(clamped * max_val)
        # Ensure it fits
        q = max(0, min(max_val, q))
        quantized.append(q)
    return quantized


def hilbert_index_from_embedding(vec: Sequence[float]) -> int | None:
    """
    Projects -> quantizes -> hilbert curve index.
    Returns int suitable for Postgres BIGINT or NUMERIC.
    """
    if not HILBERT_ENABLED:
        return None
        
    hc = _get_hilbert_curve()
    if hc is None:
        return None
        
    projected = project_embedding(vec)
    ints = quantize(projected, HILBERT_BITS)
    
    # Use distance_from_point() for hilbertcurve >= 2.0
    index = hc.distance_from_point(ints)
    return index
