from __future__ import annotations

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


class MIRDocument(BaseModel):
    version: Literal["mir/1"] = "mir/1"
    renderer: MIRRenderer
    project_id: int
    query: str
    generated_at: datetime
    memory_pack_text: str | None = None
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


def build_mir_from_recall(
    *,
    project_id: int,
    query: str,
    output_format: str,
    memory_pack_text: str,
    items: Sequence[object],
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
    return MIRDocument(
        renderer=_renderer_for(output_format),
        project_id=project_id,
        query=query,
        generated_at=generated_at,
        memory_pack_text=memory_pack_text,
        items=mir_items,
    )


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
