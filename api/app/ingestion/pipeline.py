"""Incremental ingestion pipeline (filesystem baseline).

This module ingests local files into `memories` with metadata:
- `source_filename`
- `source_last_modified`
- `ingestion_chunk_index`

It is designed so CocoIndex can call into the same logic later.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analyzer.algorithm import compute_embedding, compute_hilbert_index
from app.models import Memory


@dataclass(frozen=True)
class IngestionConfig:
    source_root: str
    max_chunk_chars: int = 1200
    source: str = "ingestion"
    memory_type: str = "doc"
    include_ext: tuple[str, ...] = (".md", ".markdown", ".txt", ".rst")


def _iter_source_files(config: IngestionConfig) -> list[Path]:
    root = Path(config.source_root)
    if not root.exists():
        return []
    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in config.include_ext:
            continue
        files.append(path)
    files.sort()
    return files


def _split_text(text: str, max_chunk_chars: int) -> list[str]:
    clean = (text or "").strip()
    if not clean:
        return []
    chunks: list[str] = []
    current = ""
    for para in clean.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        candidate = para if not current else f"{current}\n\n{para}"
        if len(candidate) <= max_chunk_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(para) <= max_chunk_chars:
            current = para
            continue
        idx = 0
        while idx < len(para):
            chunks.append(para[idx : idx + max_chunk_chars].strip())
            idx += max_chunk_chars
        current = ""
    if current:
        chunks.append(current)
    return chunks


def _chunk_hash(project_id: int, content: str) -> str:
    # mtime is intentionally excluded so unchanged content keeps the same hash.
    return hashlib.sha256(f"{project_id}:{content}".encode("utf-8")).hexdigest()


async def _file_already_indexed_at_mtime(
    db: AsyncSession,
    *,
    project_id: int,
    rel_path: str,
    mtime: str,
) -> bool:
    row = (
        await db.execute(
            select(Memory.id)
            .where(Memory.project_id == project_id)
            .where(Memory.metadata_json["source_filename"].astext == rel_path)
            .where(Memory.metadata_json["source_last_modified"].astext == mtime)
            .limit(1)
        )
    ).scalar_one_or_none()
    return row is not None


async def ingest_path_incremental(
    db: AsyncSession,
    *,
    project_id: int,
    created_by_user_id: int | None,
    config: IngestionConfig,
) -> dict[str, int]:
    """Ingest changed files into memory cards for a project.

    Idempotency rule:
    - each chunk hash maps to one memory row via `content_hash`
    - existing hash updates metadata and timestamps, no duplicate rows
    """
    inserted = 0
    updated = 0
    skipped = 0

    for path in _iter_source_files(config):
        stat = path.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        rel_path = os.path.relpath(path, config.source_root)
        # mtime gate: skip full file processing when already indexed at same timestamp.
        if await _file_already_indexed_at_mtime(
            db,
            project_id=project_id,
            rel_path=rel_path,
            mtime=mtime,
        ):
            skipped += 1
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            skipped += 1
            continue
        chunks = _split_text(content, config.max_chunk_chars)

        for idx, chunk in enumerate(chunks):
            c_hash = _chunk_hash(project_id, chunk)
            existing = (
                await db.execute(
                    select(Memory).where(
                        Memory.project_id == project_id,
                        Memory.content_hash == c_hash,
                    ).limit(1)
                )
            ).scalar_one_or_none()
            metadata = {
                "source_filename": rel_path,
                "source_last_modified": mtime,
                "ingestion_chunk_index": idx,
                "ingestion_pipeline": "cocoindex-baseline",
            }
            if existing is not None:
                existing.metadata_json = {**(existing.metadata_json or {}), **metadata}
                updated += 1
                continue

            vector = compute_embedding(chunk)
            memory = Memory(
                project_id=project_id,
                created_by_user_id=created_by_user_id,
                type=config.memory_type,
                source=config.source,
                title=rel_path,
                content=chunk,
                metadata_json=metadata,
                content_hash=c_hash,
                search_vector=vector,
                embedding_vector=vector,
                hilbert_index=compute_hilbert_index(vector),
            )
            db.add(memory)
            inserted += 1

    return {"inserted": inserted, "updated": updated, "skipped": skipped}
