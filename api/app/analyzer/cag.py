"""CAG (Cache-Augmented Generation) bootstrap for static golden knowledge.

Phase 3 additions:
- In-memory pheromone + recency (LRU) metadata per cache item.
- Hybrid eviction (lowest pheromone, LRU tiebreaker).
- Periodic pheromone evaporation support.
- KV-cache preparation stub for compressive/Infini-attention integration.
"""
from __future__ import annotations

import hashlib
import math
import os
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

CAG_ENABLED = os.getenv("CAG_ENABLED", "true").strip().lower() == "true"
CAG_MAX_TOKENS = int(os.getenv("CAG_MAX_TOKENS", "180000"))
CAG_MATCH_THRESHOLD = float(os.getenv("CAG_MATCH_THRESHOLD", "0.58"))
CAG_MODE = os.getenv("CAG_MODE", "local").strip().lower() or "local"
CAG_EMBEDDING_MODEL_NAME = (
    os.getenv("CAG_EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2").strip() or "all-MiniLM-L6-v2"
)
CAG_EMBEDDING_DIMS = int(os.getenv("CAG_EMBEDDING_DIMS", "384"))
CAG_EMBEDDING_PROVIDER = os.getenv("CAG_EMBEDDING_PROVIDER", "hash").strip().lower() or "hash"

# Pheromone-guided cache tuning.
CAG_CACHE_MAX_ITEMS = int(os.getenv("CAG_CACHE_MAX_ITEMS", "512"))
CAG_PHEROMONE_BASE = float(os.getenv("CAG_PHEROMONE_BASE", "1.0"))
CAG_PHEROMONE_HIT_BOOST = float(os.getenv("CAG_PHEROMONE_HIT_BOOST", "0.15"))
CAG_PHEROMONE_MAX = float(os.getenv("CAG_PHEROMONE_MAX", "25.0"))
CAG_PHEROMONE_MIN = float(os.getenv("CAG_PHEROMONE_MIN", "0.001"))
CAG_PHEROMONE_EVAPORATION = float(os.getenv("CAG_PHEROMONE_EVAPORATION", "0.95"))
CAG_EVAPORATION_INTERVAL_SECONDS = int(os.getenv("CAG_EVAPORATION_INTERVAL_SECONDS", "600"))

CAG_KV_STUB_ENABLED = os.getenv("CAG_KV_STUB_ENABLED", "true").strip().lower() == "true"

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


@dataclass
class CAGChunk:
    source: str
    content: str
    embedding: tuple[float, ...]
    kv_tensor_stub: dict[str, Any]
    created_at: datetime
    last_accessed_at: datetime
    pheromone_level: float
    hit_count: int = 0


@dataclass(frozen=True)
class CAGAnswer:
    source: str
    score: float
    snippets: list[str]


@dataclass
class _CAGState:
    chunks: list[CAGChunk]
    warmed_at: datetime | None
    last_evaporation_at: datetime | None
    total_queries: int
    total_hits: int
    total_misses: int
    total_evicted: int


_STATE = _CAGState(
    chunks=[],
    warmed_at=None,
    last_evaporation_at=None,
    total_queries=0,
    total_hits=0,
    total_misses=0,
    total_evicted=0,
)
_LOCK = threading.Lock()


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


def _build_kv_tensor_stub(source: str, content: str) -> dict[str, Any]:
    if not CAG_KV_STUB_ENABLED:
        return {}
    token_est = _approx_tokens(content)
    digest = hashlib.sha256(f"kv:{source}:{content}".encode("utf-8")).hexdigest()
    return {
        "kv_stub_id": digest[:24],
        "token_estimate": token_est,
        "compressed_bytes_estimate": int(token_est * 12),
        "prepared_at": datetime.now(timezone.utc).isoformat(),
    }


def _build_chunks() -> list[CAGChunk]:
    chunks: list[CAGChunk] = []
    budget = CAG_MAX_TOKENS
    now = datetime.now(timezone.utc)

    for path in _resolve_source_files():
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for part in _chunk_text(content):
            cost = _approx_tokens(part)
            if cost > budget:
                return chunks
            chunks.append(
                CAGChunk(
                    source=str(path),
                    content=part,
                    embedding=_embed_text(part),
                    kv_tensor_stub=_build_kv_tensor_stub(str(path), part),
                    created_at=now,
                    last_accessed_at=now,
                    pheromone_level=CAG_PHEROMONE_BASE,
                )
            )
            budget -= cost

    for source, content in _BUILTIN_GOLDEN_KNOWLEDGE:
        cost = _approx_tokens(content)
        if cost > budget:
            break
        chunks.append(
            CAGChunk(
                source=source,
                content=content,
                embedding=_embed_text(content),
                kv_tensor_stub=_build_kv_tensor_stub(source, content),
                created_at=now,
                last_accessed_at=now,
                pheromone_level=CAG_PHEROMONE_BASE,
            )
        )
        budget -= cost
    return chunks


def _evict_to_capacity(chunks: list[CAGChunk]) -> tuple[list[CAGChunk], int]:
    if CAG_CACHE_MAX_ITEMS <= 0 or len(chunks) <= CAG_CACHE_MAX_ITEMS:
        return chunks, 0
    ordered = sorted(chunks, key=lambda c: (c.pheromone_level, c.last_accessed_at, c.created_at))
    evicted = len(ordered) - CAG_CACHE_MAX_ITEMS
    kept = ordered[evicted:]
    kept.sort(key=lambda c: c.created_at)
    return kept, evicted


def warm_cag_cache(force: bool = False) -> tuple[CAGChunk, ...]:
    if not CAG_ENABLED:
        return tuple()
    with _LOCK:
        if _STATE.chunks and not force:
            return tuple(_STATE.chunks)
        chunks = _build_chunks()
        chunks, evicted = _evict_to_capacity(chunks)
        _STATE.chunks = chunks
        _STATE.warmed_at = datetime.now(timezone.utc)
        _STATE.last_evaporation_at = _STATE.warmed_at
        _STATE.total_evicted += evicted
        print(
            f"[cag] preload enabled={CAG_ENABLED} mode={CAG_MODE} embed_model={CAG_EMBEDDING_MODEL_NAME} "
            f"chunks={len(chunks)} max_tokens={CAG_MAX_TOKENS} cache_max_items={CAG_CACHE_MAX_ITEMS}"
        )
        return tuple(_STATE.chunks)


def get_cag_cache_stats() -> dict[str, Any]:
    with _LOCK:
        return {
            "enabled": CAG_ENABLED,
            "mode": CAG_MODE,
            "items": len(_STATE.chunks),
            "max_items": CAG_CACHE_MAX_ITEMS,
            "max_tokens": CAG_MAX_TOKENS,
            "total_evicted": _STATE.total_evicted,
            "warmed_at": _STATE.warmed_at.isoformat() if _STATE.warmed_at else None,
            "last_evaporation_at": _STATE.last_evaporation_at.isoformat() if _STATE.last_evaporation_at else None,
        }


def promote_cag_chunk(source: str, content: str, embedding: list[float] | tuple[float, ...]) -> bool:
    """Promote a high-signal text chunk into the in-memory CAG."""
    if not CAG_ENABLED:
        return False
    
    clean_content = (content or "").strip()
    if not clean_content:
        return False

    now = datetime.now(timezone.utc)
    with _LOCK:
        # Check if already present by exact content
        for chunk in _STATE.chunks:
            if chunk.content == clean_content:
                # Update existing chunk's recency/pheromone instead of duplicate
                chunk.last_accessed_at = now
                chunk.pheromone_level = max(
                    CAG_PHEROMONE_MIN,
                    min(CAG_PHEROMONE_MAX, chunk.pheromone_level + CAG_PHEROMONE_HIT_BOOST)
                )
                return True

        new_chunk = CAGChunk(
            source=source,
            content=clean_content,
            embedding=tuple(embedding),
            kv_tensor_stub=_build_kv_tensor_stub(source, clean_content),
            created_at=now,
            last_accessed_at=now,
            pheromone_level=CAG_PHEROMONE_BASE,
            hit_count=1,
        )

        cost = _approx_tokens(clean_content)
        current_cost = sum(_approx_tokens(c.content) for c in _STATE.chunks)

        _STATE.chunks.append(new_chunk)
        
        # Enforce budget either by count or tokens
        chunks, evicted = _evict_to_capacity(_STATE.chunks)
        _STATE.chunks = chunks
        _STATE.total_evicted += evicted
        
        # If still over token budget, evict the lowest pheromones until under
        current_cost = sum(_approx_tokens(c.content) for c in _STATE.chunks)
        while current_cost > CAG_MAX_TOKENS and len(_STATE.chunks) > 0:
            # sort by lowest pheromone, oldest accessed, oldest created
            ordered = sorted(_STATE.chunks, key=lambda c: (c.pheromone_level, c.last_accessed_at, c.created_at))
            evicted_chunk = ordered.pop(0)
            current_cost -= _approx_tokens(evicted_chunk.content)
            _STATE.chunks = ordered
            _STATE.total_evicted += 1
            
        # Keep time-sorted for internal logic
        _STATE.chunks.sort(key=lambda c: c.created_at)

    return True


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

    ranked: list[tuple[float, int, CAGChunk]] = []
    best_source = ""
    best_score = 0.0
    for idx, chunk in enumerate(chunks):
        score = float(_dot(query_embedding, chunk.embedding))
        if score <= 0:
            continue
        ranked.append((score, idx, chunk))
        if score > best_score:
            best_score = score
            best_source = chunk.source

    with _LOCK:
        _STATE.total_queries += 1

    if best_score < CAG_MATCH_THRESHOLD or not ranked:
        with _LOCK:
            _STATE.total_misses += 1
        return None

    ranked.sort(key=lambda row: row[0], reverse=True)
    snippets = [chunk.content for _, _, chunk in ranked[:max_snippets]]
    now = datetime.now(timezone.utc)
    with _LOCK:
        _STATE.total_hits += 1
        for score, idx, _ in ranked[:max_snippets]:
            chunk = _STATE.chunks[idx]
            chunk.hit_count += 1
            chunk.last_accessed_at = now
            chunk.pheromone_level = max(
                CAG_PHEROMONE_MIN,
                min(CAG_PHEROMONE_MAX, chunk.pheromone_level + (CAG_PHEROMONE_HIT_BOOST * max(score, 0.05))),
            )
    return CAGAnswer(source=best_source, score=round(best_score, 6), snippets=snippets)


def evaporate_pheromones() -> dict[str, Any]:
    with _LOCK:
        if not _STATE.chunks:
            return {"status": "ok", "items": 0, "evaporated_at": datetime.now(timezone.utc).isoformat()}
        factor = max(0.0, min(1.0, CAG_PHEROMONE_EVAPORATION))
        for chunk in _STATE.chunks:
            chunk.pheromone_level = max(CAG_PHEROMONE_MIN, chunk.pheromone_level * factor)
        _STATE.last_evaporation_at = datetime.now(timezone.utc)
        return {
            "status": "ok",
            "items": len(_STATE.chunks),
            "evaporation_factor": factor,
            "evaporated_at": _STATE.last_evaporation_at.isoformat(),
        }


def evaporation_interval_seconds() -> int:
    return max(0, CAG_EVAPORATION_INTERVAL_SECONDS)


def maybe_evaporate_due(now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    with _LOCK:
        if not _STATE.chunks:
            return False
        if _STATE.last_evaporation_at is None:
            _STATE.last_evaporation_at = now
            return False
        if now - _STATE.last_evaporation_at < timedelta(seconds=evaporation_interval_seconds()):
            return False
    evaporate_pheromones()
    return True


def get_cag_cache_stats(*, sample_size: int = 10) -> dict[str, Any]:
    with _LOCK:
        entries = list(_STATE.chunks)
        total = len(entries)
        avg_pheromone = round(sum(c.pheromone_level for c in entries) / total, 6) if total else 0.0
        kv_tokens = sum(int(c.kv_tensor_stub.get("token_estimate", 0)) for c in entries if c.kv_tensor_stub)
        top = sorted(entries, key=lambda c: (-c.pheromone_level, c.last_accessed_at))[: max(1, sample_size)]
        return {
            "enabled": CAG_ENABLED,
            "mode": CAG_MODE,
            "embedding_model": CAG_EMBEDDING_MODEL_NAME,
            "cache_items": total,
            "cache_max_items": CAG_CACHE_MAX_ITEMS,
            "total_queries": _STATE.total_queries,
            "total_hits": _STATE.total_hits,
            "total_misses": _STATE.total_misses,
            "hit_rate": round((_STATE.total_hits / _STATE.total_queries), 6) if _STATE.total_queries else 0.0,
            "total_evicted": _STATE.total_evicted,
            "avg_pheromone": avg_pheromone,
            "last_evaporation_at": _STATE.last_evaporation_at.isoformat() if _STATE.last_evaporation_at else None,
            "evaporation_factor": CAG_PHEROMONE_EVAPORATION,
            "evaporation_interval_seconds": evaporation_interval_seconds(),
            "kv_stub_enabled": CAG_KV_STUB_ENABLED,
            "kv_token_budget_used": kv_tokens,
            "top_entries": [
                {
                    "source": entry.source,
                    "hit_count": entry.hit_count,
                    "pheromone_level": round(entry.pheromone_level, 6),
                    "last_accessed_at": entry.last_accessed_at.isoformat(),
                }
                for entry in top
            ],
        }
