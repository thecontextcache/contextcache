"""CocoIndex flow definition (optional dependency).

When the `cocoindex` package is installed, this module exposes a real
`@cocoindex.flow_def` flow that can be orchestrated by CocoIndex runtime.
Without it, the decorator becomes a no-op so local development still works.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


try:  # pragma: no cover - optional dependency
    import cocoindex
except Exception:  # pragma: no cover
    class _CocoStub:
        @staticmethod
        def flow_def(*_args, **_kwargs):
            def decorator(fn):
                return fn
            return decorator

    cocoindex = _CocoStub()  # type: ignore[assignment]


@dataclass(frozen=True)
class CocoIngestionSource:
    storage_type: str
    root: str


@cocoindex.flow_def(name="contextcache_incremental_ingestion")
def cocoindex_ingest_flow(source: CocoIngestionSource) -> dict[str, str]:
    """Describe the ingestion source for CocoIndex orchestration.

    `storage_type` examples:
    - `local` (dev): root is local path mounted into API/worker container
    - `s3` (prod): root is bucket/prefix string
    - `gdrive` (prod): root is drive folder id
    """
    root_path = Path(source.root).as_posix() if source.storage_type == "local" else source.root
    return {
        "status": "ready",
        "storage_type": source.storage_type,
        "root": root_path,
    }
