from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .db import get_db
from .models import Project, Memory
from .schemas import ProjectCreate, ProjectOut, MemoryCreate, MemoryOut, RecallOut

router = APIRouter()

@router.post("/projects", response_model=ProjectOut)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(name=payload.name)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectOut(id=project.id, name=project.name)

@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Project).order_by(Project.id.desc()))
    projects = res.scalars().all()
    return [ProjectOut(id=p.id, name=p.name) for p in projects]

@router.post("/projects/{project_id}/memories", response_model=MemoryOut)
async def create_memory(project_id: int, payload: MemoryCreate, db: AsyncSession = Depends(get_db)):
    # ensure project exists
    res = await db.execute(select(Project).where(Project.id == project_id))
    if res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    m = Memory(project_id=project_id, type=payload.type, content=payload.content)
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return MemoryOut(id=m.id, project_id=m.project_id, type=m.type, content=m.content)

@router.get("/projects/{project_id}/memories", response_model=list[MemoryOut])
async def list_memories(project_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Memory).where(Memory.project_id == project_id).order_by(Memory.id.desc()))
    items = res.scalars().all()
    return [MemoryOut(id=i.id, project_id=i.project_id, type=i.type, content=i.content) for i in items]

@router.get("/projects/{project_id}/recall", response_model=RecallOut)
async def recall(project_id: int, query: str, limit: int = 10, db: AsyncSession = Depends(get_db)):
    # very simple MVP: filter memories in project and do substring match in python
    res = await db.execute(select(Memory).where(Memory.project_id == project_id).order_by(Memory.id.desc()))
    all_items = res.scalars().all()

    q = query.lower().strip()
    matched = [m for m in all_items if q in m.content.lower()][:limit]

    pack_lines = []
    for m in matched:
        pack_lines.append(f"- [{m.type}] {m.content}")

    memory_pack = "PROJECT MEMORY PACK\n" + "\n".join(pack_lines) if pack_lines else "PROJECT MEMORY PACK\n(no matches)"

    out_items = [MemoryOut(id=m.id, project_id=m.project_id, type=m.type, content=m.content) for m in matched]
    return RecallOut(project_id=project_id, query=query, memory_pack_text=memory_pack, items=out_items)
