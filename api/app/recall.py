"""recall.py — thin shim that delegates to the analyzer package.

Algorithm logic lives in app.analyzer.core (server-only).
This file exists only for backward-compatibility with any callers
that import from app.recall directly.
"""
from __future__ import annotations

from typing import List, Tuple

from .analyzer.core import _build_pack


def build_memory_pack(query: str, items: List[Tuple[str, str]]) -> str:
    """Format (type, content) pairs into a structured text pack."""
    return _build_pack(query, items)
