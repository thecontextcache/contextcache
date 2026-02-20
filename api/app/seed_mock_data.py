from __future__ import annotations

import asyncio
import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select

from .analyzer.algorithm import compute_embedding
from .db import AsyncSessionLocal
from .models import (
    AuthUser,
    Memory,
    MemoryEmbedding,
    MemoryTag,
    Membership,
    Organization,
    Project,
    Tag,
    User,
)

TARGET_AUTH_USER_ID = 2
DEFAULT_ORG_NAME = os.getenv("MOCK_ORG_NAME", "Demo Org").strip() or "Demo Org"
DEFAULT_EMAIL = os.getenv("MOCK_USER_EMAIL", "dn@thecontextcache.com").strip().lower()
DEFAULT_DISPLAY_NAME = os.getenv("MOCK_USER_DISPLAY_NAME", "DN Admin").strip() or "DN Admin"
EMBED_MODEL = os.getenv("EMBEDDING_PROVIDER", "local").strip().lower() or "local"
EMBED_VERSION = os.getenv("EMBEDDING_MODEL_VERSION", "v1").strip() or "v1"


@dataclass(frozen=True)
class MockMemory:
    type: str
    title: str
    content: str
    tags: tuple[str, ...]
    metadata: dict[str, Any]
    days_ago: int


MOCK_PROJECTS: dict[str, list[MockMemory]] = {
    "Alpha Launch": [
        MockMemory(
            type="decision",
            title="Beta rollout sequence",
            content="Ship invite-only beta first, then expand to waitlist cohorts in weekly waves.",
            tags=("launch", "beta", "ops"),
            metadata={"labels": ["launch"], "author": "dn@thecontextcache.com"},
            days_ago=5,
        ),
        MockMemory(
            type="finding",
            title="Support demand pattern",
            content="Most onboarding questions were about org scoping and API key setup.",
            tags=("support", "onboarding"),
            metadata={"source": "support-review", "severity": "medium"},
            days_ago=4,
        ),
        MockMemory(
            type="todo",
            title="Post-beta migration dry run",
            content="Run backup/restore dry run before raising daily usage limits for new cohorts.",
            tags=("todo", "infra"),
            metadata={"owner": "platform", "status": "open"},
            days_ago=1,
        ),
    ],
    "Q2 Planning": [
        MockMemory(
            type="definition",
            title="Qualified memory",
            content="A qualified memory is concise, actionable, and references a project decision.",
            tags=("framework", "knowledge"),
            metadata={"taxonomy": "memory-quality", "confidence": 0.92},
            days_ago=7,
        ),
        MockMemory(
            type="note",
            title="Pricing note",
            content="Usage tiers should map to env-configured limits so operators can tune safely.",
            tags=("pricing", "limits"),
            metadata={"doc": "pricing-review", "audience": "internal"},
            days_ago=3,
        ),
        MockMemory(
            type="link",
            title="Deployment runbook",
            content="https://docs.thecontextcache.com/06-deployment/",
            tags=("docs", "ops"),
            metadata={"kind": "url", "verified": True},
            days_ago=2,
        ),
    ],
    "Research Roadmap": [
        MockMemory(
            type="finding",
            title="Recall quality signal",
            content="Hybrid FTS + vector + recency gave better top-3 relevance than token overlap only.",
            tags=("recall", "ranking", "research"),
            metadata={"experiment": "hybrid-v1", "winner": "hybrid"},
            days_ago=6,
        ),
        MockMemory(
            type="decision",
            title="Embedding provider fallback",
            content="Use deterministic local vectors unless OpenAI/Ollama is explicitly configured.",
            tags=("embeddings", "reliability"),
            metadata={"provider": "local", "reason": "determinism"},
            days_ago=2,
        ),
        MockMemory(
            type="todo",
            title="RRF evaluation",
            content="Evaluate reciprocal-rank-fusion for combining FTS and vector ranking.",
            tags=("todo", "ml", "recall"),
            metadata={"priority": "p1", "owner": "research"},
            days_ago=0,
        ),
    ],
}


async def _ensure_org(session, name: str) -> Organization:
    org = (
        await session.execute(
            select(Organization).where(Organization.name == name).order_by(Organization.id.asc()).limit(1)
        )
    ).scalar_one_or_none()
    if org is None:
        org = Organization(name=name)
        session.add(org)
        await session.flush()
    return org


async def _ensure_auth_user(session, email: str) -> AuthUser:
    email = email.strip().lower()
    now = datetime.now(timezone.utc)
    user = (
        await session.execute(select(AuthUser).where(func.lower(AuthUser.email) == email).limit(1))
    ).scalar_one_or_none()

    if user is None:
        created_new = False
        row_id_2 = (
            await session.execute(select(AuthUser).where(AuthUser.id == TARGET_AUTH_USER_ID).limit(1))
        ).scalar_one_or_none()
        if row_id_2 is None:
            user = AuthUser(
                id=TARGET_AUTH_USER_ID,
                email=email,
                is_admin=True,
                is_disabled=False,
                invite_accepted_at=now,
                last_login_at=now,
            )
            created_new = True
        else:
            row_id_2.email = email
            row_id_2.is_admin = True
            row_id_2.is_disabled = False
            if row_id_2.invite_accepted_at is None:
                row_id_2.invite_accepted_at = now
            if row_id_2.last_login_at is None:
                row_id_2.last_login_at = now
            user = row_id_2
        if created_new:
            session.add(user)
            await session.flush()

    user.is_admin = True
    user.is_disabled = False
    if user.invite_accepted_at is None:
        user.invite_accepted_at = now
    if user.last_login_at is None:
        user.last_login_at = now
    return user


async def _ensure_domain_user(
    session,
    *,
    email: str,
    display_name: str,
    preferred_id: int,
) -> User:
    email = email.strip().lower()
    user = (await session.execute(select(User).where(func.lower(User.email) == email).limit(1))).scalar_one_or_none()
    if user is None:
        created_new = False
        row_id = (await session.execute(select(User).where(User.id == preferred_id).limit(1))).scalar_one_or_none()
        if row_id is None:
            user = User(id=preferred_id, email=email, display_name=display_name)
            created_new = True
        else:
            row_id.email = email
            if not row_id.display_name:
                row_id.display_name = display_name
            user = row_id
        if created_new:
            session.add(user)
            await session.flush()
    elif not user.display_name:
        user.display_name = display_name
    return user


async def _ensure_membership(session, org_id: int, user_id: int) -> None:
    membership = (
        await session.execute(
            select(Membership).where(Membership.org_id == org_id, Membership.user_id == user_id).limit(1)
        )
    ).scalar_one_or_none()
    if membership is None:
        membership = Membership(org_id=org_id, user_id=user_id, role="owner")
        session.add(membership)
    else:
        membership.role = "owner"


async def _ensure_project(session, *, org_id: int, created_by_user_id: int, name: str) -> Project:
    project = (
        await session.execute(
            select(Project)
            .where(Project.org_id == org_id, Project.name == name)
            .order_by(Project.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if project is None:
        project = Project(org_id=org_id, created_by_user_id=created_by_user_id, name=name)
        session.add(project)
        await session.flush()
    return project


async def _ensure_tag(session, *, project_id: int, tag_name: str) -> Tag:
    clean = tag_name.strip().lower()
    tag = (
        await session.execute(
            select(Tag).where(Tag.project_id == project_id, func.lower(Tag.name) == clean).limit(1)
        )
    ).scalar_one_or_none()
    if tag is None:
        tag = Tag(project_id=project_id, name=clean)
        session.add(tag)
        await session.flush()
    return tag


async def _ensure_memory(
    session,
    *,
    project: Project,
    auth_user: AuthUser,
    payload: MockMemory,
) -> tuple[Memory, bool]:
    content_hash = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
    existing = (
        await session.execute(
            select(Memory)
            .where(
                Memory.project_id == project.id,
                Memory.content_hash == content_hash,
                Memory.title == payload.title,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False

    created_at = datetime.now(timezone.utc) - timedelta(days=max(0, payload.days_ago))
    embedding_input = f"{payload.title}\n{payload.content}".strip()
    embedding = compute_embedding(embedding_input)

    memory = Memory(
        project_id=project.id,
        created_by_user_id=auth_user.id,
        type=payload.type,
        source="seed",
        title=payload.title,
        content=payload.content,
        metadata_json={
            **payload.metadata,
            "seeded_by": "scripts/seed_mock_data.py",
            "tags": list(payload.tags),
        },
        content_hash=content_hash,
        search_vector=embedding,
        embedding_vector=embedding,
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(memory)
    await session.flush()

    for tag_name in payload.tags:
        tag = await _ensure_tag(session, project_id=project.id, tag_name=tag_name)
        existing_rel = (
            await session.execute(
                select(MemoryTag)
                .where(MemoryTag.memory_id == memory.id, MemoryTag.tag_id == tag.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing_rel is None:
            session.add(MemoryTag(memory_id=memory.id, tag_id=tag.id))

    embedding_row = (
        await session.execute(
            select(MemoryEmbedding).where(MemoryEmbedding.memory_id == memory.id).limit(1)
        )
    ).scalar_one_or_none()
    if embedding_row is None:
        session.add(
            MemoryEmbedding(
                memory_id=memory.id,
                model=EMBED_MODEL,
                model_name=EMBED_MODEL,
                model_version=EMBED_VERSION,
                confidence=1.0,
                dims=len(embedding),
                metadata_json={"seeded": True, "source": "mock-data"},
                updated_at=created_at,
            )
        )
    return memory, True


async def _enqueue_embeddings(memory_ids: list[int]) -> None:
    if not memory_ids:
        return
    try:
        from .worker.tasks import _enqueue_if_enabled, compute_memory_embedding
    except Exception:
        return
    for memory_id in memory_ids:
        _enqueue_if_enabled(compute_memory_embedding, memory_id)


async def seed_mock_data() -> None:
    async with AsyncSessionLocal() as session:
        org = await _ensure_org(session, DEFAULT_ORG_NAME)
        auth_user = await _ensure_auth_user(session, DEFAULT_EMAIL)
        domain_user = await _ensure_domain_user(
            session,
            email=DEFAULT_EMAIL,
            display_name=DEFAULT_DISPLAY_NAME,
            preferred_id=TARGET_AUTH_USER_ID,
        )
        await _ensure_membership(session, org_id=org.id, user_id=domain_user.id)

        created_projects = 0
        ensured_projects = 0
        created_memories = 0
        created_memory_ids: list[int] = []
        for project_name, entries in MOCK_PROJECTS.items():
            existing_project = (
                await session.execute(
                    select(Project)
                    .where(Project.org_id == org.id, Project.name == project_name)
                    .order_by(Project.id.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            project = await _ensure_project(
                session,
                org_id=org.id,
                created_by_user_id=domain_user.id,
                name=project_name,
            )
            if existing_project is None:
                created_projects += 1
            ensured_projects += 1
            for entry in entries:
                memory, created = await _ensure_memory(
                    session,
                    project=project,
                    auth_user=auth_user,
                    payload=entry,
                )
                if created:
                    created_memories += 1
                    created_memory_ids.append(memory.id)

        await session.commit()

    await _enqueue_embeddings(created_memory_ids)

    print("Mock data seed complete.")
    print(f"Org: {DEFAULT_ORG_NAME}")
    print(f"Auth user: {DEFAULT_EMAIL} (id={auth_user.id}, admin={auth_user.is_admin})")
    print(f"Domain user: {DEFAULT_EMAIL} (id={domain_user.id})")
    print(f"Projects ensured: {ensured_projects} (created={created_projects})")
    print(f"New memories created: {created_memories}")
    if created_memory_ids:
        print(f"Embedding refresh queued for memory IDs: {created_memory_ids}")


def main() -> None:
    asyncio.run(seed_mock_data())


if __name__ == "__main__":
    main()
