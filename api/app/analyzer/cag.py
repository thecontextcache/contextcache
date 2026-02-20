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
import hashlib
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

CAG_ENABLED = os.getenv("CAG_ENABLED", "true").strip().lower() == "true"
CAG_MAX_TOKENS = int(os.getenv("CAG_MAX_TOKENS", "180000"))
CAG_MATCH_THRESHOLD = float(os.getenv("CAG_MATCH_THRESHOLD", "0.58"))
CAG_MODE = os.getenv("CAG_MODE", "local").strip().lower() or "local"
CAG_EMBEDDING_MODEL_NAME = os.getenv("CAG_EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2").strip() or "all-MiniLM-L6-v2"
CAG_EMBEDDING_DIMS = int(os.getenv("CAG_EMBEDDING_DIMS", "384"))
CAG_EMBEDDING_PROVIDER = os.getenv("CAG_EMBEDDING_PROVIDER", "hash").strip().lower() or "hash"
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
    embedding: tuple[float, ...]


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


def _normalize(vec: list[float]) -> tuple[float, ...]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return tuple(v / norm for v in vec)


def _hash_embedding(text: str) -> tuple[float, ...]:
    vec = [0.0] * CAG_EMBEDDING_DIMS
    tokens = re.findall(r"\b[a-z0-9_]{2,}\b", (text or "").lower())
    if not tokens:
        return tuple(vec)
    for token in tokens:
        digest = hashlib.sha256(f"{CAG_EMBEDDING_MODEL_NAME}:{token}".encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % CAG_EMBEDDING_DIMS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + (digest[5] / 255.0) * 0.25
        vec[idx] += sign * weight
    return _normalize(vec)


@lru_cache(maxsize=1)
def _load_sentence_transformer():  # pragma: no cover - optional dependency path
    if CAG_EMBEDDING_PROVIDER not in {"sentence-transformers", "sentence_transformers", "minilm"}:
        return None
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except Exception:
        return None
    try:
        return SentenceTransformer(CAG_EMBEDDING_MODEL_NAME)
    except Exception:
        return None


def _embed_text(text: str) -> tuple[float, ...]:
    model = _load_sentence_transformer()
    if model is not None:  # pragma: no cover - optional dependency path
        try:
            embedding = model.encode(text, normalize_embeddings=True)
            return tuple(float(v) for v in embedding)
        except Exception:
            pass
    return _hash_embedding(text)


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
            emb = _embed_text(part)
            chunks.append(CAGChunk(source=str(path), content=part, embedding=emb))
            budget -= cost

    for source, content in _BUILTIN_GOLDEN_KNOWLEDGE:
        cost = _approx_tokens(content)
        if cost > budget:
            break
        emb = _embed_text(content)
        chunks.append(CAGChunk(source=source, content=content, embedding=emb))
        budget -= cost
    return chunks


@lru_cache(maxsize=1)
def warm_cag_cache() -> tuple[CAGChunk, ...]:
    if not CAG_ENABLED:
        return tuple()
    chunks = tuple(_build_chunks())
    print(
        f"[cag] preload enabled={CAG_ENABLED} mode={CAG_MODE} embed_model={CAG_EMBEDDING_MODEL_NAME} "
        f"chunks={len(chunks)} max_tokens={CAG_MAX_TOKENS}"
    )
    return chunks


def is_local_cag() -> bool:
    return CAG_MODE in {"local", "inproc", "in-memory", "in_memory"}


def _dot(vec_a: tuple[float, ...], vec_b: tuple[float, ...]) -> float:
    return sum(a * b for a, b in zip(vec_a, vec_b))


def maybe_answer_from_cache(query: str, *, max_snippets: int = 3) -> CAGAnswer | None:
    if not CAG_ENABLED:
        return None
    query_clean = (query or "").strip()
    if not query_clean:
        return None
    chunks = warm_cag_cache()
    if not chunks:
        return None

    query_embedding = _embed_text(query_clean)
    if not query_embedding:
        return None

    best_source = ""
    best_score = 0.0
    ranked: list[tuple[float, CAGChunk]] = []
    for chunk in chunks:
        score = float(_dot(query_embedding, chunk.embedding))
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
