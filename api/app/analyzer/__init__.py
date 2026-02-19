"""Analyzer package — server-only scoring and recall logic.

This module MUST stay inside api/app/analyzer/ and is never imported by
any Next.js / frontend code.  The public surface is intentionally narrow:

    from app.analyzer import score_memories, build_memory_pack

ANALYZER_MODE controls where scoring runs:
  "local"   — in-process (default; no extra infra)
  "service" — internal HTTP call to a separate analyzer container
              (see service_client.py; the container is NOT publicly routed)
"""
from __future__ import annotations

import os

_MODE = os.getenv("ANALYZER_MODE", "local").strip().lower()


def score_memories(
    query: str,
    memories: list[dict],
    *,
    limit: int = 20,
) -> list[dict]:
    """Rank memories by relevance to query.

    Each item in *memories* must have at least 'id', 'type', 'content'.
    Returns a list of the same dicts, enriched with 'rank_score', sorted
    descending by score.

    The caller should never pass tokens, API keys, or session data inside
    *memories* or *query* — this function is pure domain logic.
    """
    if _MODE == "service":
        from .service_client import score_memories_remote
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            score_memories_remote(query, memories, limit=limit)
        )
    from .core import score_memories_local
    return score_memories_local(query, memories, limit=limit)


def build_memory_pack(query: str, items: list[tuple[str, str]]) -> str:
    """Format ranked items into a structured text pack for LLM injection."""
    from .core import _build_pack
    return _build_pack(query, items)
