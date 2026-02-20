from __future__ import annotations

from datetime import datetime, timedelta, timezone

import app.analyzer.cag as cag


def _reset_cag_state() -> None:
    with cag._LOCK:
        cag._STATE.chunks = []
        cag._STATE.warmed_at = None
        cag._STATE.last_evaporation_at = None
        cag._STATE.total_queries = 0
        cag._STATE.total_hits = 0
        cag._STATE.total_misses = 0
        cag._STATE.total_evicted = 0


def test_pheromone_eviction_prefers_lowest_then_lru(monkeypatch) -> None:
    _reset_cag_state()
    monkeypatch.setattr(cag, "CAG_CACHE_MAX_ITEMS", 2)
    now = datetime.now(timezone.utc)
    chunks = [
        cag.CAGChunk(
            source="low-old",
            content="a",
            embedding=(1.0, 0.0),
            kv_tensor_stub={},
            created_at=now - timedelta(minutes=30),
            last_accessed_at=now - timedelta(minutes=30),
            pheromone_level=0.2,
        ),
        cag.CAGChunk(
            source="low-new",
            content="b",
            embedding=(0.5, 0.5),
            kv_tensor_stub={},
            created_at=now - timedelta(minutes=20),
            last_accessed_at=now - timedelta(minutes=2),
            pheromone_level=0.2,
        ),
        cag.CAGChunk(
            source="high",
            content="c",
            embedding=(0.0, 1.0),
            kv_tensor_stub={},
            created_at=now - timedelta(minutes=10),
            last_accessed_at=now - timedelta(minutes=1),
            pheromone_level=0.9,
        ),
    ]

    kept, evicted = cag._evict_to_capacity(chunks)
    assert evicted == 1
    kept_sources = {item.source for item in kept}
    assert "low-old" not in kept_sources
    assert kept_sources == {"low-new", "high"}


def test_cag_hits_reinforce_and_evaporation_decays(monkeypatch) -> None:
    _reset_cag_state()
    monkeypatch.setattr(cag, "CAG_ENABLED", True)
    monkeypatch.setattr(cag, "CAG_MATCH_THRESHOLD", 0.0)
    monkeypatch.setattr(cag, "CAG_PHEROMONE_HIT_BOOST", 0.4)
    monkeypatch.setattr(cag, "CAG_PHEROMONE_EVAPORATION", 0.5)
    now = datetime.now(timezone.utc)
    chunk = cag.CAGChunk(
        source="stub-source",
        content="alpha retrieval memory",
        embedding=cag._embed_text("alpha retrieval memory"),
        kv_tensor_stub={"token_estimate": 3},
        created_at=now,
        last_accessed_at=now,
        pheromone_level=1.0,
    )
    with cag._LOCK:
        cag._STATE.chunks = [chunk]
        cag._STATE.last_evaporation_at = now

    answer = cag.maybe_answer_from_cache("alpha")
    assert answer is not None
    boosted = chunk.pheromone_level
    assert boosted > 1.0
    assert chunk.hit_count == 1

    result = cag.evaporate_pheromones()
    assert result["status"] == "ok"
    assert chunk.pheromone_level < boosted

    stats = cag.get_cag_cache_stats(sample_size=1)
    assert stats["cache_items"] == 1
    assert stats["total_hits"] >= 1
    assert stats["top_entries"][0]["source"] == "stub-source"
