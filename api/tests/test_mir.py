from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.compiler.mir import build_mir_from_recall, memory_type_to_mir_kind, render_toon_x
from app.schemas import RecallItemOut


def test_memory_type_to_mir_kind_maps_current_memory_types() -> None:
    assert memory_type_to_mir_kind("decision") == "decision"
    assert memory_type_to_mir_kind("todo") == "next_hop"
    assert memory_type_to_mir_kind("link") == "artifact"
    assert memory_type_to_mir_kind("finding") == "fact"
    assert memory_type_to_mir_kind("unknown-new-type") == "unknown"


def test_build_mir_from_recall_builds_ranked_items_and_renderer() -> None:
    now = datetime(2026, 3, 30, 18, 0, tzinfo=timezone.utc)
    item = RecallItemOut(
        id=42,
        project_id=7,
        created_by_user_id=3,
        type="decision",
        source="manual",
        title="Use compiler framing",
        content="Treat recall as compiler-v1 output.",
        metadata={},
        tags=["vision", "compiler"],
        created_at=now - timedelta(days=2),
        updated_at=None,
        rank_score=0.93,
    )

    doc = build_mir_from_recall(
        project_id=7,
        query="compiler vision",
        output_format="toon",
        memory_pack_text="CTX/1 ...",
        items=[item],
        now=now,
    )

    assert doc.version == "mir/1"
    assert doc.renderer == "toon/v1"
    assert doc.project_id == 7
    assert doc.query == "compiler vision"
    assert len(doc.items) == 1

    mir_item = doc.items[0]
    assert mir_item.id == "memory:42"
    assert mir_item.kind == "decision"
    assert mir_item.rank == 1
    assert mir_item.confidence == 0.93
    assert mir_item.importance == 0.93
    assert mir_item.freshness is not None
    assert mir_item.freshness.status == "fresh"
    assert mir_item.evidence_refs == ["memory:42"]
    assert mir_item.tags == ["vision", "compiler"]


def test_render_toon_x_uses_mir_fields() -> None:
    now = datetime(2026, 3, 30, 18, 0, tzinfo=timezone.utc)
    item = RecallItemOut(
        id=9,
        project_id=7,
        created_by_user_id=3,
        type="todo",
        source="manual",
        title=None,
        content="Add concept tables before summary nodes.",
        metadata={},
        tags=["db", "roadmap"],
        created_at=now - timedelta(days=12),
        updated_at=None,
        rank_score=0.61,
    )

    doc = build_mir_from_recall(
        project_id=7,
        query="next compiler step",
        output_format="toonx",
        memory_pack_text="",
        items=[item],
        now=now,
    )
    rendered = render_toon_x(doc)

    assert rendered.startswith('CTX/1 q="next compiler step" n=1')
    assert "memory:9" in rendered
    assert "next_hop" in rendered
    assert "conf=0.61" in rendered
    assert "fresh=aging" in rendered
    assert "tags=db,roadmap" in rendered
