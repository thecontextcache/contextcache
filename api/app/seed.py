from __future__ import annotations

import asyncio

from sqlalchemy import select

from .db import AsyncSessionLocal, engine
from .models import Base, Memory, Project

DEMO_PROJECT_NAME = "Demo Project"

DEMO_MEMORIES = [
    ("decision", "Use Postgres + SQLAlchemy async for persistence."),
    ("definition", "Memory pack = formatted recall context grouped by type."),
    ("finding", "Recall ranks cards with Postgres FTS and falls back to recency."),
    ("todo", "Add Auth/Teams/Roles in Phase 2."),
    ("link", "API docs: http://localhost:8000/docs"),
    ("note", "This seed script is idempotent."),
]


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        project_result = await session.execute(
            select(Project).where(Project.name == DEMO_PROJECT_NAME).order_by(Project.id.asc()).limit(1)
        )
        project = project_result.scalars().first()
        if project is None:
            project = Project(name=DEMO_PROJECT_NAME)
            session.add(project)
            await session.flush()

        existing_memories_result = await session.execute(
            select(Memory.id).where(Memory.project_id == project.id)
        )
        has_memories = existing_memories_result.first() is not None
        if not has_memories:
            for memory_type, content in DEMO_MEMORIES:
                session.add(Memory(project_id=project.id, type=memory_type, content=content))

        await session.commit()
        print(f"Seed complete: project_id={project.id}, name={project.name}")


if __name__ == "__main__":
    asyncio.run(seed())
