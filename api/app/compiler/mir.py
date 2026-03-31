from __future__ import annotations

from hashlib import sha256
from datetime import datetime, timezone
from typing import Literal, Sequence

from pydantic import BaseModel, Field

MIRKind = Literal[
    "fact",
    "decision",
    "constraint",
    "procedure",
    "episode",
    "concept",
    "artifact",
    "delta",
    "conflict",
    "unknown",
    "next_hop",
]
MIRRenderer = Literal["recall-pack/v1", "toon/v1", "toon-x/v1"]
MIRScopeLevel = Literal["memory", "query", "project", "org", "episode"]
MIRFreshnessStatus = Literal["fresh", "aging", "stale", "unknown"]


class MIRScope(BaseModel):
    level: MIRScopeLevel
    project_id: int | None = None
    org_id: int | None = None
    episode_id: int | None = None


class MIRFreshness(BaseModel):
    status: MIRFreshnessStatus = "unknown"
    age_days: int | None = Field(default=None, ge=0)


class MIRItem(BaseModel):
    id: str
    kind: MIRKind
    content: str = Field(min_length=1)
    title: str | None = None
    scope: MIRScope
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    freshness: MIRFreshness | None = None
    importance: float | None = Field(default=None, ge=0.0, le=1.0)
    rank: int | None = Field(default=None, ge=1)
    concept_refs: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    contradicts: list[str] = Field(default_factory=list)
    supersedes: list[str] = Field(default_factory=list)
    why_included: str | None = None
    source_memory_id: int | None = None
    source_memory_type: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime | None = None


class MIRBundle(BaseModel):
    bundle_id: str
    target_format: str
    item_count: int = Field(ge=0)
    token_estimate: int | None = Field(default=None, ge=0)


class MIRRetrievalPlan(BaseModel):
    served_by: str
    strategy: str
    input_memory_ids: list[int] = Field(default_factory=list)
    ranked_memory_ids: list[int] = Field(default_factory=list)
    candidate_count: int | None = Field(default=None, ge=0)
    weights: dict[str, float] = Field(default_factory=dict)
    reason: str | None = None
    score_source: str | None = None


class MIRDocument(BaseModel):
    version: Literal["mir/1"] = "mir/1"
    renderer: MIRRenderer
    project_id: int
    query: str
    generated_at: datetime
    memory_pack_text: str | None = None
    bundle: MIRBundle | None = None
    retrieval_plan: MIRRetrievalPlan | None = None
    items: list[MIRItem] = Field(default_factory=list)


_ARTIFACT_MEMORY_TYPES = {"chat", "doc", "code", "file", "web", "link", "snippet"}
_FACT_MEMORY_TYPES = {"finding", "definition", "note", "context", "event", "issue"}


def memory_type_to_mir_kind(memory_type: str | None) -> MIRKind:
    normalized = (memory_type or "").strip().lower()
    if normalized == "decision":
        return "decision"
    if normalized == "todo":
        return "next_hop"
    if normalized in _ARTIFACT_MEMORY_TYPES:
        return "artifact"
    if normalized in _FACT_MEMORY_TYPES:
        return "fact"
    return "unknown"


def _freshness_for(created_at: datetime | None, *, now: datetime) -> MIRFreshness:
    if created_at is None:
        return MIRFreshness(status="unknown", age_days=None)
    aware_created_at = created_at if created_at.tzinfo is not None else created_at.replace(tzinfo=timezone.utc)
    age_days = max(0, int((now - aware_created_at).total_seconds() // 86400))
    if age_days <= 7:
        status: MIRFreshnessStatus = "fresh"
    elif age_days <= 30:
        status = "aging"
    else:
        status = "stale"
    return MIRFreshness(status=status, age_days=age_days)


def _renderer_for(output_format: str) -> MIRRenderer:
    normalized = (output_format or "").strip().lower()
    if normalized == "toon":
        return "toon/v1"
    if normalized in {"toonx", "toon-x"}:
        return "toon-x/v1"
    return "recall-pack/v1"


def _token_estimate_for(text: str | None) -> int | None:
    if not text:
        return None
    return max(1, len(text.split()))


def _bundle_id_for(document: MIRDocument, *, target_format: str) -> str:
    digest = sha256()
    digest.update(document.version.encode("utf-8"))
    digest.update(b"|")
    digest.update(document.renderer.encode("utf-8"))
    digest.update(b"|")
    digest.update(str(document.project_id).encode("utf-8"))
    digest.update(b"|")
    digest.update(target_format.encode("utf-8"))
    digest.update(b"|")
    digest.update(document.query.encode("utf-8"))
    digest.update(b"|")
    digest.update((document.memory_pack_text or "").encode("utf-8"))
    for item in document.items:
        digest.update(b"|")
        digest.update(item.id.encode("utf-8"))
    return f"bundle:{digest.hexdigest()[:16]}"


def refresh_mir_bundle(document: MIRDocument, *, target_format: str) -> None:
    document.bundle = MIRBundle(
        bundle_id=_bundle_id_for(document, target_format=target_format),
        target_format=target_format,
        item_count=len(document.items),
        token_estimate=_token_estimate_for(document.memory_pack_text),
    )


def build_mir_from_recall(
    *,
    project_id: int,
    query: str,
    output_format: str,
    memory_pack_text: str,
    items: Sequence[object],
    served_by: str = "rag",
    strategy: str = "recency",
    input_memory_ids: Sequence[int] | None = None,
    ranked_memory_ids: Sequence[int] | None = None,
    score_details: dict[str, object] | None = None,
    weights: dict[str, float] | None = None,
    now: datetime | None = None,
) -> MIRDocument:
    generated_at = now or datetime.now(timezone.utc)
    mir_items: list[MIRItem] = []
    for index, item in enumerate(items, start=1):
        item_id = int(getattr(item, "id"))
        created_at = getattr(item, "created_at", None)
        rank_score = getattr(item, "rank_score", None)
        why_included = "recent memory" if rank_score is None else "matched query terms and ranked highly"
        mir_items.append(
            MIRItem(
                id=f"memory:{item_id}",
                kind=memory_type_to_mir_kind(getattr(item, "type", None)),
                content=getattr(item, "content"),
                title=getattr(item, "title", None),
                scope=MIRScope(level="project", project_id=project_id),
                confidence=rank_score,
                freshness=_freshness_for(created_at, now=generated_at),
                importance=rank_score,
                rank=index,
                concept_refs=[],
                evidence_refs=[f"memory:{item_id}"],
                contradicts=[],
                supersedes=[],
                why_included=why_included,
                source_memory_id=item_id,
                source_memory_type=getattr(item, "type", None),
                tags=list(getattr(item, "tags", []) or []),
                created_at=created_at,
            )
        )
    normalized_output_format = (output_format or "").strip().lower() or "text"
    retrieval_details = score_details or {}
    candidate_count = retrieval_details.get("candidate_count")
    if not isinstance(candidate_count, int):
        candidate_count = len(list(input_memory_ids or [])) or len(list(ranked_memory_ids or []))
    reason = retrieval_details.get("reason")
    score_source = retrieval_details.get("source")
    raw_retrieval_weights = weights or retrieval_details.get("weights") or {}
    retrieval_weights = raw_retrieval_weights if isinstance(raw_retrieval_weights, dict) else {}
    document = MIRDocument(
        renderer=_renderer_for(output_format),
        project_id=project_id,
        query=query,
        generated_at=generated_at,
        memory_pack_text=memory_pack_text,
        retrieval_plan=MIRRetrievalPlan(
            served_by=served_by,
            strategy=strategy,
            input_memory_ids=list(input_memory_ids or []),
            ranked_memory_ids=list(ranked_memory_ids or []),
            candidate_count=candidate_count,
            weights={str(key): float(value) for key, value in dict(retrieval_weights).items()},
            reason=str(reason) if isinstance(reason, str) and reason else None,
            score_source=str(score_source) if isinstance(score_source, str) and score_source else None,
        ),
        items=mir_items,
    )
    refresh_mir_bundle(document, target_format=normalized_output_format)
    return document


def render_toon_x(document: MIRDocument) -> str:
    def _compress(text: str | None) -> str:
        return " ".join((text or "").strip().split())

    def _fmt_score(value: float | None) -> str:
        return "-" if value is None else f"{value:.2f}"

    query = _compress(document.query)
    lines = [f'CTX/1 q="{query}" n={len(document.items)}']
    for item in document.items:
        freshness = item.freshness.status if item.freshness is not None else "unknown"
        tags = ",".join(item.tags) if item.tags else "-"
        lines.append(
            " | ".join(
                [
                    str(item.rank or "-"),
                    item.id,
                    item.kind,
                    f"conf={_fmt_score(item.confidence)}",
                    f"fresh={freshness}",
                    f"tags={tags}",
                    _compress(item.content),
                ]
            )
        )
    return "\n".join(lines)
