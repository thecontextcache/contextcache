"""Local (in-process) scoring and ranking logic.

This file is SERVER-ONLY.  It must never be imported by web/ or exposed
through any public API response.  Algorithm details stay here.

Design:
- Token overlap scoring (fast, no ML needed for MVP)
- Recency boost: newer memories score slightly higher when tie-breaking
- Type priority: decisions/findings rank above notes/links by default
"""
from __future__ import annotations

import math
import re
import hashlib
from datetime import datetime, timezone
from typing import Any


# Relative importance of memory types when token scores tie
_TYPE_PRIORITY: dict[str, int] = {
    "decision": 10,
    "finding": 9,
    "definition": 8,
    "todo": 7,
    "code": 6,
    "doc": 5,
    "chat": 4,
    "note": 3,
    "link": 2,
    "event": 1,
    "web": 1,
    "file": 1,
}

# Recency half-life in days — score halves every N days
_RECENCY_HALF_LIFE_DAYS = 14.0

# Weight of recency vs token overlap (0 = pure token, 1 = pure recency)
_RECENCY_WEIGHT = 0.15


def _tokenize(text: str) -> set[str]:
    """Lower-case alphanumeric tokens, length ≥ 2."""
    return {t for t in re.findall(r"\b[a-z0-9_]{2,}\b", text.lower()) if len(t) <= 40}


def _recency_score(created_at: datetime | None) -> float:
    if created_at is None:
        return 0.0
    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - created_at).total_seconds() / 86400.0)
    return math.exp(-math.log(2) * age_days / _RECENCY_HALF_LIFE_DAYS)


def _token_overlap(query_tokens: set[str], text: str) -> float:
    if not query_tokens:
        return 0.0
    mem_tokens = _tokenize(text)
    if not mem_tokens:
        return 0.0
    hits = len(query_tokens & mem_tokens)
    # Jaccard-like: hits / union, boosted by hit density in memory
    union = len(query_tokens | mem_tokens)
    density = hits / max(1, len(mem_tokens))
    jaccard = hits / max(1, union)
    return (jaccard + density) / 2.0


def score_memories_local(
    query: str,
    memories: list[dict[str, Any]],
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Score and sort memories by relevance to query.

    Input  memories: list of dicts with at minimum 'type', 'content'.
                     Optional: 'title', 'tags', 'created_at'.
    Output: same dicts with 'rank_score' added, sorted desc, top *limit*.
    """
    query_tokens = _tokenize(query)

    scored: list[tuple[float, int, dict[str, Any]]] = []
    for idx, mem in enumerate(memories):
        # Build searchable text — title is more important, prepend it twice
        text_parts = []
        if mem.get("title"):
            text_parts.append(str(mem["title"]))
            text_parts.append(str(mem["title"]))  # weight title higher
        text_parts.append(str(mem.get("content", "")))
        if mem.get("tags"):
            text_parts.append(" ".join(str(t) for t in mem["tags"]))
        full_text = " ".join(text_parts)

        overlap = _token_overlap(query_tokens, full_text)

        created_at = mem.get("created_at")
        if isinstance(created_at, str):
            try:
                from datetime import datetime as _dt
                created_at = _dt.fromisoformat(created_at)
            except ValueError:
                created_at = None
        recency = _recency_score(created_at)

        type_boost = _TYPE_PRIORITY.get(str(mem.get("type", "")), 0) / 10.0 * 0.05

        final_score = (
            (1.0 - _RECENCY_WEIGHT) * overlap
            + _RECENCY_WEIGHT * recency
            + type_boost
        )
        scored.append((final_score, idx, mem))

    scored.sort(key=lambda x: (-x[0], x[1]))
    result = []
    for score, _, mem in scored[:limit]:
        out = dict(mem)
        out["rank_score"] = round(score, 6)
        result.append(out)
    return result


# ---------------------------------------------------------------------------
# Memory pack formatter (moved from recall.py; recall.py keeps its wrapper)
# ---------------------------------------------------------------------------

_PACK_ORDER = ["decision", "definition", "finding", "todo", "code", "doc", "link", "note"]


def _build_pack(query: str, items: list[tuple[str, str]]) -> str:
    """Format (type, content) pairs into a structured text pack."""
    lines = ["PROJECT MEMORY PACK", f"Query: {query}", ""]
    grouped: dict[str, list[str]] = {}
    for t, c in items:
        grouped.setdefault(t, []).append(c)

    for t in _PACK_ORDER:
        if t in grouped:
            lines.append(f"{t.upper()}:")
            for c in grouped[t]:
                lines.append(f"- {c}")
            lines.append("")

    for t, arr in grouped.items():
        if t in _PACK_ORDER:
            continue
        lines.append(f"{t.upper()}:")
        for c in arr:
            lines.append(f"- {c}")
        lines.append("")

    return "\n".join(lines).strip()


def compute_embedding(text: str, *, model: str = "local-hash-128", dims: int = 128) -> list[float]:
    """Deterministic local embedding stub (server-only).

    This is intentionally simple for alpha:
    - no external model dependency
    - stable output for same input
    - suitable for background pipeline wiring tests
    """
    text = (text or "").strip()
    if not text:
        return [0.0] * dims

    seed = hashlib.sha256(f"{model}:{text}".encode("utf-8")).digest()
    vec: list[float] = []
    cur = seed
    while len(vec) < dims:
        cur = hashlib.sha256(cur).digest()
        for i in range(0, len(cur), 2):
            if len(vec) >= dims:
                break
            n = (cur[i] << 8) | cur[i + 1]
            vec.append((n / 32767.5) - 1.0)  # [-1, 1]

    # L2 normalize for consistent cosine behavior in future pgvector search.
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]
