from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

from sqlalchemy import select

from .db import AsyncSessionLocal, generate_api_key, hash_api_key
from .migrate import run_migrations
from .models import ApiKey, Membership, Memory, Organization, Project, User

DEMO_ORG_NAME = "Demo Org"
DEMO_USER_EMAIL = "demo@local"
DEMO_USER_DISPLAY_NAME = "Demo Owner"
DEMO_API_KEY_NAME = "demo-key"
DEMO_PROJECT_NAME = "Demo Project"
SEED_ORG_ID = os.getenv("SEED_ORG_ID", "").strip()
FORCE_ROTATE_DEMO_KEY = os.getenv("FORCE_ROTATE_DEMO_KEY", "").strip() == "1"

DEMO_MEMORIES = [
    ("decision", "Use Postgres + SQLAlchemy async for persistence."),
    ("definition", "Memory pack = formatted recall context grouped by type."),
    ("finding", "Recall ranks cards with Postgres FTS and falls back to recency."),
    ("todo", "Add users and richer team workflows in future phases."),
    ("link", "API docs: http://localhost:8000/docs"),
    ("note", "This seed script is idempotent."),
]


async def seed() -> None:
    await run_migrations()

    async with AsyncSessionLocal() as session:
        if SEED_ORG_ID:
            try:
                seed_org_id_int = int(SEED_ORG_ID)
            except ValueError as exc:
                raise RuntimeError("SEED_ORG_ID must be an integer") from exc
            org = (
                await session.execute(
                    select(Organization).where(Organization.id == seed_org_id_int).limit(1)
                )
            ).scalar_one_or_none()
            if org is None:
                raise RuntimeError(f"SEED_ORG_ID={SEED_ORG_ID} not found")
        else:
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
        rotated_keys_count = 0
        existing_active_key = (
            await session.execute(
                select(ApiKey)
                .where(ApiKey.org_id == org.id, ApiKey.revoked_at.is_(None))
                .order_by(ApiKey.id.asc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if FORCE_ROTATE_DEMO_KEY:
            active_keys = (
                await session.execute(
                    select(ApiKey).where(ApiKey.org_id == org.id, ApiKey.revoked_at.is_(None))
                )
            ).scalars().all()
            for active_key in active_keys:
                active_key.revoked_at = datetime.now(timezone.utc)
            rotated_keys_count = len(active_keys)
            created_plaintext_key = generate_api_key()
            key = ApiKey(
                org_id=org.id,
                name=DEMO_API_KEY_NAME,
                key_hash=hash_api_key(created_plaintext_key),
                prefix=created_plaintext_key[:8],
            )
            session.add(key)
            existing_active_key = key
        else:
            key = existing_active_key
            if key is None:
                created_plaintext_key = generate_api_key()
                key = ApiKey(
                    org_id=org.id,
                    name=DEMO_API_KEY_NAME,
                    key_hash=hash_api_key(created_plaintext_key),
                    prefix=created_plaintext_key[:8],
                )
                session.add(key)

        if existing_active_key is not None:
            project = (
                await session.execute(
                    select(Project)
                    .where(Project.org_id == org.id)
                    .order_by(Project.id.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        else:
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

        if project is not None:
            existing_memories = (
                await session.execute(select(Memory.id).where(Memory.project_id == project.id).limit(1))
            ).first()
            if existing_memories is None:
                for memory_type, content in DEMO_MEMORIES:
                    session.add(Memory(project_id=project.id, type=memory_type, content=content))

        await session.commit()

        print(f"Seed complete: org_id={org.id}, org_name={org.name}")
        print(f"Seed user: email={user.email}, role=owner")
        if project is not None:
            print(f"Seed project: project_id={project.id}, name={project.name}")
        else:
            print("Seed project: none found; skipped project/memory creation due to existing API key.")
        if FORCE_ROTATE_DEMO_KEY:
            print(f"Force-rotated active API keys for org: revoked_count={rotated_keys_count}")
        if created_plaintext_key is not None:
            print(f"Seed API key (store now, shown once): {created_plaintext_key}")
            print(f"Seed API key prefix: {created_plaintext_key[:8]}")
        elif key is not None:
            print(f"Seed API key already exists: name={key.name}, prefix={key.prefix}")


if __name__ == "__main__":
    asyncio.run(seed())
