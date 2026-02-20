"""CAG (Cache-Augmented Generation) bootstrap for static golden knowledge.

This module is intentionally lightweight:
- Loads a small static corpus from docs files (when available) + built-ins.
- Keeps the corpus in-memory as a stand-in for an LLM KV cache.
- Provides a deterministic query matcher to decide whether to short-circuit
  recall before database retrieval.

The retrieval/decision algorithm is still server-side only.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .algorithm import token_overlap_score

CAG_ENABLED = os.getenv("CAG_ENABLED", "true").strip().lower() == "true"
CAG_MAX_TOKENS = int(os.getenv("CAG_MAX_TOKENS", "180000"))
CAG_MATCH_THRESHOLD = float(os.getenv("CAG_MATCH_THRESHOLD", "0.58"))
_DEFAULT_CAG_FILES = (
    "docs/00-overview.md",
    "docs/01-mvp-scope.md",
    "docs/04-api-contract.md",
    "docs/legal.md",
)

_BUILTIN_GOLDEN_KNOWLEDGE = [
    (
        "product_overview",
        "TheContextCache is a project memory layer for AI teams. "
        "Users capture decisions, findings, definitions, and notes, then run recall "
        "to produce a paste-ready memory pack grouped by memory type.",
    ),
    (
        "security_baseline",
        "Authentication supports magic-link sessions for web usage and API keys for "
        "programmatic calls. API keys are hashed at rest and scoped to organizations.",
    ),
    (
        "recall_baseline",
        "Recall uses hybrid scoring: PostgreSQL full-text search rank, vector similarity, "
        "and recency boost. If no match is found, recency fallback returns latest memories.",
    ),
]


@dataclass(frozen=True)
class CAGChunk:
    source: str
    content: str


@dataclass(frozen=True)
class CAGAnswer:
    source: str
    score: float
    snippets: list[str]


def _chunk_text(text: str, *, max_chars: int = 1400) -> list[str]:
    clean = (text or "").strip()
    if not clean:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", clean) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        candidate = para if not buf else f"{buf}\n\n{para}"
        if len(candidate) <= max_chars:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
        if len(para) <= max_chars:
            buf = para
            continue
        start = 0
        while start < len(para):
            chunks.append(para[start : start + max_chars].strip())
            start += max_chars
        buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def _resolve_source_files() -> list[Path]:
    raw = os.getenv("CAG_SOURCE_FILES", "").strip()
    file_list = [p.strip() for p in raw.split(",") if p.strip()] if raw else list(_DEFAULT_CAG_FILES)
    project_root = Path(__file__).resolve().parents[3]
    paths: list[Path] = []
    for rel in file_list:
        candidate = Path(rel)
        if not candidate.is_absolute():
            candidate = (project_root / rel).resolve()
        if candidate.exists() and candidate.is_file():
            paths.append(candidate)
    return paths


def _approx_tokens(text: str) -> int:
    # Coarse estimate: 1 token ~= 4 chars for English prose.
    return max(1, len(text) // 4)


def _build_chunks() -> list[CAGChunk]:
    chunks: list[CAGChunk] = []
    budget = CAG_MAX_TOKENS
    for path in _resolve_source_files():
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for part in _chunk_text(content):
            cost = _approx_tokens(part)
            if cost > budget:
                return chunks
            chunks.append(CAGChunk(source=str(path), content=part))
            budget -= cost

    for source, content in _BUILTIN_GOLDEN_KNOWLEDGE:
        cost = _approx_tokens(content)
        if cost > budget:
            break
        chunks.append(CAGChunk(source=source, content=content))
        budget -= cost
    return chunks


@lru_cache(maxsize=1)
def warm_cag_cache() -> tuple[CAGChunk, ...]:
    if not CAG_ENABLED:
        return tuple()
    chunks = tuple(_build_chunks())
    print(
        f"[cag] preload enabled={CAG_ENABLED} chunks={len(chunks)} max_tokens={CAG_MAX_TOKENS}"
    )
    return chunks


def maybe_answer_from_cache(query: str, *, max_snippets: int = 3) -> CAGAnswer | None:
    if not CAG_ENABLED:
        return None
    query_clean = (query or "").strip()
    if not query_clean:
        return None
    chunks = warm_cag_cache()
    if not chunks:
        return None

    best_source = ""
    best_score = 0.0
    ranked: list[tuple[float, CAGChunk]] = []
    for chunk in chunks:
        score = token_overlap_score(query_clean, chunk.content)
        if score <= 0:
            continue
        ranked.append((score, chunk))
        if score > best_score:
            best_score = score
            best_source = chunk.source

    if best_score < CAG_MATCH_THRESHOLD:
        return None

    ranked.sort(key=lambda row: row[0], reverse=True)
    snippets = [chunk.content for _, chunk in ranked[:max_snippets]]
    return CAGAnswer(source=best_source, score=round(best_score, 6), snippets=snippets)
