from __future__ import annotations

import asyncio

from sqlalchemy import select

from .db import AsyncSessionLocal, engine, ensure_fts_schema, ensure_multitenant_schema, generate_api_key, hash_api_key
from .models import ApiKey, Base, Membership, Memory, Organization, Project, User

DEMO_ORG_NAME = "Demo Org"
DEMO_USER_EMAIL = "demo@local"
DEMO_USER_DISPLAY_NAME = "Demo Owner"
DEMO_API_KEY_NAME = "demo-key"
DEMO_PROJECT_NAME = "Demo Project"

DEMO_MEMORIES = [
    ("decision", "Use Postgres + SQLAlchemy async for persistence."),
    ("definition", "Memory pack = formatted recall context grouped by type."),
    ("finding", "Recall ranks cards with Postgres FTS and falls back to recency."),
    ("todo", "Add users and richer team workflows in future phases."),
    ("link", "API docs: http://localhost:8000/docs"),
    ("note", "This seed script is idempotent."),
]


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_multitenant_schema()
    await ensure_fts_schema()

    async with AsyncSessionLocal() as session:
        org = (
            await session.execute(
                select(Organization).where(Organization.name == DEMO_ORG_NAME).order_by(Organization.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if org is None:
            org = Organization(name=DEMO_ORG_NAME)
            session.add(org)
            await session.flush()

        user = (
            await session.execute(
                select(User).where(User.email == DEMO_USER_EMAIL).order_by(User.id.asc()).limit(1)
            )
        ).scalar_one_or_none()
        if user is None:
            user = User(email=DEMO_USER_EMAIL, display_name=DEMO_USER_DISPLAY_NAME)
            session.add(user)
            await session.flush()

        membership = (
            await session.execute(
                select(Membership)
                .where(Membership.org_id == org.id, Membership.user_id == user.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if membership is None:
            session.add(Membership(org_id=org.id, user_id=user.id, role="owner"))

        created_plaintext_key: str | None = None
        key = (
            await session.execute(
                select(ApiKey)
                .where(ApiKey.org_id == org.id, ApiKey.name == DEMO_API_KEY_NAME, ApiKey.revoked_at.is_(None))
                .order_by(ApiKey.id.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if key is None:
            created_plaintext_key = generate_api_key()
            key = ApiKey(
                org_id=org.id,
                name=DEMO_API_KEY_NAME,
                key_hash=hash_api_key(created_plaintext_key),
                prefix=created_plaintext_key[:8],
            )
            session.add(key)

        project = (
            await session.execute(
                select(Project)
                .where(Project.org_id == org.id, Project.name == DEMO_PROJECT_NAME)
                .order_by(Project.id.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if project is None:
            project = Project(name=DEMO_PROJECT_NAME, org_id=org.id, created_by_user_id=user.id)
            session.add(project)
            await session.flush()

        existing_memories = (
            await session.execute(select(Memory.id).where(Memory.project_id == project.id).limit(1))
        ).first()
        if existing_memories is None:
            for memory_type, content in DEMO_MEMORIES:
                session.add(Memory(project_id=project.id, type=memory_type, content=content))

        await session.commit()

        print(f"Seed complete: org_id={org.id}, org_name={org.name}")
        print(f"Seed user: email={user.email}, role=owner")
        print(f"Seed project: project_id={project.id}, name={project.name}")
        if created_plaintext_key is not None:
            print(f"Seed API key (store now, shown once): {created_plaintext_key}")
            print(f"Seed API key prefix: {created_plaintext_key[:8]}")
        elif key is not None:
            print(f"Seed API key already exists: name={key.name}, prefix={key.prefix}")


if __name__ == "__main__":
    asyncio.run(seed())
