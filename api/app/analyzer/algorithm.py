"""ContextCache ranking/embedding algorithm module.

IMPORTANT MAINTAINER NOTE:
- Keep all scoring and ranking logic in THIS file only.
- Routes/services may fetch data, but they must call functions here for
  weighting, normalization, recency, and model-based scoring decisions.
- This design allows swapping to an external analyzer service later without
  touching route-level business logic.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from urllib import request as urllib_request

from sqlalchemy import desc, func, select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


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

_PACK_ORDER = ["decision", "definition", "finding", "todo", "code", "doc", "link", "note"]


@dataclass(frozen=True)
class HybridWeights:
    fts: float
    vector: float
    recency: float


@dataclass(frozen=True)
class HybridRecallConfig:
    fts_weight: float
    vector_weight: float
    recency_weight: float
    vector_min_score: float
    vector_candidates: int


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"\b[a-z0-9_]{2,}\b", text.lower()) if len(t) <= 40}


def normalize_positive(values: dict[int, float]) -> dict[int, float]:
    if not values:
        return {}
    max_val = max(values.values())
    if max_val <= 0:
        return {k: 0.0 for k in values}
    return {k: max(0.0, v) / max_val for k, v in values.items()}


def recency_boost(created_at: datetime | None, *, half_life_days: float = 14.0) -> float:
    if created_at is None:
        return 0.0
    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - created_at).total_seconds() / 86400.0)
    return math.exp(-math.log(2) * age_days / half_life_days)


def token_overlap_score(query: str, text: str) -> float:
    query_tokens = tokenize(query)
    if not query_tokens:
        return 0.0
    mem_tokens = tokenize(text)
    if not mem_tokens:
        return 0.0
    hits = len(query_tokens & mem_tokens)
    union = len(query_tokens | mem_tokens)
    density = hits / max(1, len(mem_tokens))
    jaccard = hits / max(1, union)
    return (jaccard + density) / 2.0


def score_memories_local(query: str, memories: list[dict[str, Any]], *, limit: int = 20) -> list[dict[str, Any]]:
    scored: list[tuple[float, int, dict[str, Any]]] = []
    for idx, mem in enumerate(memories):
        text_parts = []
        if mem.get("title"):
            text_parts.append(str(mem["title"]))
            text_parts.append(str(mem["title"]))
        text_parts.append(str(mem.get("content", "")))
        if mem.get("tags"):
            text_parts.append(" ".join(str(t) for t in mem["tags"]))
        full_text = " ".join(text_parts)
        overlap = token_overlap_score(query, full_text)

        created_at = mem.get("created_at")
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at)
            except ValueError:
                created_at = None
        recency = recency_boost(created_at)
        type_boost = _TYPE_PRIORITY.get(str(mem.get("type", "")), 0) / 10.0 * 0.05
        final_score = (1.0 - 0.15) * overlap + 0.15 * recency + type_boost
        scored.append((final_score, idx, mem))

    scored.sort(key=lambda x: (-x[0], x[1]))
    out: list[dict[str, Any]] = []
    for score, _, mem in scored[:limit]:
        row = dict(mem)
        row["rank_score"] = round(score, 6)
        out.append(row)
    return out


def merge_hybrid_scores(
    *,
    fts_scores: dict[int, float],
    vector_scores: dict[int, float],
    created_at_by_id: dict[int, datetime | None],
    weights: HybridWeights,
    limit: int,
) -> tuple[list[tuple[int, float]], dict[int, dict[str, float]]]:
    fts_norm = normalize_positive(fts_scores)
    vector_norm = normalize_positive(vector_scores)
    candidate_ids = set(fts_norm) | set(vector_norm)

    scored_rows: list[tuple[int, float]] = []
    score_details: dict[int, dict[str, float]] = {}
    for mem_id in candidate_ids:
        recency = recency_boost(created_at_by_id.get(mem_id))
        total = (
            weights.fts * fts_norm.get(mem_id, 0.0)
            + weights.vector * vector_norm.get(mem_id, 0.0)
            + weights.recency * recency
        )
        total = round(float(total), 6)
        scored_rows.append((mem_id, total))
        score_details[mem_id] = {
            "fts": round(float(fts_norm.get(mem_id, 0.0)), 6),
            "vector": round(float(vector_norm.get(mem_id, 0.0)), 6),
            "recency": round(float(recency), 6),
            "total": total,
        }

    scored_rows.sort(key=lambda x: (-x[1], -x[0]))
    return scored_rows[:limit], score_details


def _build_pack(query: str, items: list[tuple[str, str]]) -> str:
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


def _fit_dims(vec: list[float], dims: int) -> list[float]:
    if len(vec) == dims:
        return vec
    if len(vec) > dims:
        return vec[:dims]
    return vec + ([0.0] * (dims - len(vec)))


def _normalize_vec(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _openai_embedding(text: str, model: str) -> list[float] | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    body = json.dumps({"model": model, "input": text}).encode("utf-8")
    req = urllib_request.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        vec = payload.get("data", [{}])[0].get("embedding")
        if isinstance(vec, list) and vec:
            return [float(v) for v in vec]
    except Exception:
        return None
    return None


def _ollama_embedding(text: str, model: str) -> list[float] | None:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").strip().rstrip("/")
    endpoint = os.getenv("OLLAMA_EMBED_ENDPOINT", f"{base_url}/api/embeddings").strip()
    body = json.dumps({"model": model, "prompt": text}).encode("utf-8")
    req = urllib_request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        vec = payload.get("embedding")
        if isinstance(vec, list) and vec:
            return [float(v) for v in vec]
    except Exception:
        return None
    return None


def compute_embedding(text: str, *, model: str = "text-embedding-3-small", dims: int = 1536) -> list[float]:
    text = (text or "").strip()
    dims = int(os.getenv("EMBEDDING_DIMS", str(dims)))
    if not text:
        return [0.0] * dims

    analyzer_mode = os.getenv("ANALYZER_MODE", "").strip().lower()
    provider = os.getenv("EMBEDDING_PROVIDER", "local").strip().lower()
    if analyzer_mode in {"ollama", "openai", "local"}:
        provider = analyzer_mode

    if provider == "openai":
        openai_model = os.getenv("OPENAI_EMBED_MODEL", model).strip() or model
        vec = _openai_embedding(text, openai_model)
        if vec:
            return _normalize_vec(_fit_dims(vec, dims))
    elif provider == "ollama":
        ollama_model = os.getenv("OLLAMA_MODEL", os.getenv("OLLAMA_EMBED_MODEL", model)).strip() or model
        vec = _ollama_embedding(text, ollama_model)
        if vec:
            return _normalize_vec(_fit_dims(vec, dims))

    seed = hashlib.sha256(f"fallback:{model}:{text}".encode("utf-8")).digest()
    vec: list[float] = []
    cur = seed
    while len(vec) < dims:
        cur = hashlib.sha256(cur).digest()
        for i in range(0, len(cur), 2):
            if len(vec) >= dims:
                break
            n = (cur[i] << 8) | cur[i + 1]
            vec.append((n / 32767.5) - 1.0)
    return _normalize_vec(vec)


async def fetch_memories_by_ids(db: "AsyncSession", memory_ids: list[int]) -> list[Any]:
    """Load memories preserving the given ID ordering.

    Ranking order is computed elsewhere; this only hydrates model rows.
    """
    if not memory_ids:
        return []
    from app.models import Memory

    rows = (await db.execute(select(Memory).where(Memory.id.in_(memory_ids)))).scalars().all()
    by_id = {row.id: row for row in rows}
    return [by_id[mid] for mid in memory_ids if mid in by_id]


def build_vector_candidate_stmt(project_id: int, query_vector: list[float], vector_candidates: int):
    """Build the vector candidate query with index-friendly ordering."""
    from app.models import Memory

    vector_distance_expr = Memory.embedding_vector.cosine_distance(query_vector)
    vector_rank_expr = (1 - vector_distance_expr).label("vector_score")
    return (
        select(Memory, vector_rank_expr)
        .where(Memory.project_id == project_id, Memory.embedding_vector.is_not(None))
        .order_by(vector_distance_expr.asc())
        .limit(vector_candidates)
    )


async def run_hybrid_rag_recall(
    db: "AsyncSession",
    *,
    project_id: int,
    query_text: str,
    limit: int,
    config: HybridRecallConfig,
) -> dict[str, Any]:
    """Execute hybrid FTS + vector + recency ranking for one project.

    This is the single source of truth for recall ranking decisions.
    """
    from app.models import Memory

    tsquery = func.websearch_to_tsquery("english", query_text)
    rank = func.ts_rank_cd(Memory.search_tsv, tsquery).label("rank_score")
    fts_rows = (
        await db.execute(
            select(Memory, rank)
            .where(Memory.project_id == project_id)
            .where(Memory.search_tsv.op("@@")(tsquery))
            .order_by(desc(rank), Memory.created_at.desc(), Memory.id.desc())
            .limit(max(limit * 3, 25))
        )
    ).all()
    fts_scores = {row[0].id: float(row[1]) for row in fts_rows}

    vector_scores: dict[int, float] = {}
    vector_rows: list[tuple[Any, float | None]] = []
    try:
        query_vector = compute_embedding(query_text)
        vector_rows = (
            await db.execute(
                build_vector_candidate_stmt(
                    project_id=project_id,
                    query_vector=query_vector,
                    vector_candidates=config.vector_candidates,
                )
            )
        ).all()
    except Exception:
        vector_rows = []

    candidate_by_id: dict[int, Any] = {}
    for mem, raw_score in vector_rows:
        score = float(raw_score) if raw_score is not None else 0.0
        if score >= config.vector_min_score:
            vector_scores[mem.id] = score
            candidate_by_id[mem.id] = mem
    for mem, _ in fts_rows:
        candidate_by_id[mem.id] = mem

    input_ids = sorted(candidate_by_id.keys())
    ranked_pairs, score_details = merge_hybrid_scores(
        fts_scores=fts_scores,
        vector_scores=vector_scores,
        created_at_by_id={mem_id: mem.created_at for mem_id, mem in candidate_by_id.items()},
        weights=HybridWeights(
            fts=config.fts_weight,
            vector=config.vector_weight,
            recency=config.recency_weight,
        ),
        limit=limit,
    )

    if ranked_pairs:
        return {
            "strategy": "hybrid",
            "input_ids": input_ids,
            "ranked_ids": [mem_id for mem_id, _ in ranked_pairs],
            "scores": {mem_id: score for mem_id, score in ranked_pairs},
            "score_details": score_details,
        }

    fallback_ids = (
        await db.execute(
            select(Memory.id)
            .where(Memory.project_id == project_id)
            .order_by(Memory.created_at.desc(), Memory.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return {
        "strategy": "recency",
        "input_ids": input_ids,
        "ranked_ids": list(fallback_ids),
        "scores": {},
        "score_details": {"reason": "no_hybrid_matches"},
    }
