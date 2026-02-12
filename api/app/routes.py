from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .models import Project, Memory
from .schemas import ProjectCreate, ProjectOut, MemoryCreate, MemoryOut, RecallItemOut, RecallOut
from .recall import build_memory_pack

router = APIRouter()


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)) -> ProjectOut:
    p = Project(name=payload.name)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return ProjectOut(id=p.id, name=p.name, created_at=p.created_at)


@router.get("/projects", response_model=List[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)) -> List[ProjectOut]:
    res = await db.execute(select(Project).order_by(Project.id.desc()))
    projects = res.scalars().all()
    return [ProjectOut(id=p.id, name=p.name, created_at=p.created_at) for p in projects]


@router.post("/projects/{project_id}/memories", response_model=MemoryOut, status_code=201)
async def create_memory(project_id: int, payload: MemoryCreate, db: AsyncSession = Depends(get_db)) -> MemoryOut:
    # ensure project exists
    res = await db.execute(select(Project).where(Project.id == project_id))
    if res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    m = Memory(project_id=project_id, type=payload.type, content=payload.content)
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return MemoryOut(
        id=m.id,
        project_id=m.project_id,
        type=m.type,
        content=m.content,
        created_at=m.created_at,
    )


@router.get("/projects/{project_id}/memories", response_model=List[MemoryOut])
async def list_memories(project_id: int, db: AsyncSession = Depends(get_db)) -> List[MemoryOut]:
    project_res = await db.execute(select(Project.id).where(Project.id == project_id))
    if project_res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    res = await db.execute(
        select(Memory).where(Memory.project_id == project_id).order_by(Memory.created_at.desc(), Memory.id.desc())
    )
    items = res.scalars().all()
    return [
        MemoryOut(
            id=i.id,
            project_id=i.project_id,
            type=i.type,
            content=i.content,
            created_at=i.created_at,
        )
        for i in items
    ]


@router.get("/projects/{project_id}/recall", response_model=RecallOut)
async def recall(
    project_id: int,
    query: str = "",
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> RecallOut:
    project_res = await db.execute(select(Project.id).where(Project.id == project_id))
    if project_res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    query_clean = query.strip()
    top_with_rank: list[tuple[Memory, float | None]] = []
    if query_clean:
        tsquery = func.plainto_tsquery("english", query_clean)
        rank = func.ts_rank_cd(Memory.search_tsv, tsquery).label("rank_score")
        fts_result = await db.execute(
            select(Memory, rank)
            .where(Memory.project_id == project_id)
            .where(Memory.search_tsv.op("@@")(tsquery))
            .order_by(desc(rank), Memory.created_at.desc(), Memory.id.desc())
            .limit(limit)
        )
        top_with_rank = [(row[0], float(row[1])) for row in fts_result.all()]
        if not top_with_rank:
            fallback_result = await db.execute(
                select(Memory)
                .where(Memory.project_id == project_id)
                .order_by(Memory.created_at.desc(), Memory.id.desc())
                .limit(limit)
            )
            top_with_rank = [(m, None) for m in fallback_result.scalars().all()]
    else:
        recent_result = await db.execute(
            select(Memory)
            .where(Memory.project_id == project_id)
            .order_by(Memory.created_at.desc(), Memory.id.desc())
            .limit(limit)
        )
        top_with_rank = [(m, None) for m in recent_result.scalars().all()]

    pack = build_memory_pack(query_clean, [(m.type, m.content) for m, _ in top_with_rank])
    out_items = [
        RecallItemOut(
            id=m.id,
            project_id=m.project_id,
            type=m.type,
            content=m.content,
            created_at=m.created_at,
            rank_score=rank_score,
        )
        for m, rank_score in top_with_rank
    ]

    return RecallOut(project_id=project_id, query=query_clean, memory_pack_text=pack, items=out_items)
