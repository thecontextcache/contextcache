from __future__ import annotations

import hashlib
import os
import secrets
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL: str = os.environ["DATABASE_URL"]

engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=False, future=True)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return f"cck_{secrets.token_urlsafe(24)}"


async def ensure_multitenant_schema() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS organizations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(200) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    display_name VARCHAR(255),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS memberships (
                    id SERIAL PRIMARY KEY,
                    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT chk_memberships_role CHECK (role IN ('owner','admin','member','viewer')),
                    CONSTRAINT uq_memberships_org_user UNIQUE (org_id, user_id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS api_keys (
                    id SERIAL PRIMARY KEY,
                    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    name VARCHAR(200) NOT NULL,
                    key_hash VARCHAR(64) NOT NULL UNIQUE,
                    prefix VARCHAR(16) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    revoked_at TIMESTAMPTZ
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id SERIAL PRIMARY KEY,
                    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    actor_user_id INTEGER REFERENCES users(id),
                    api_key_prefix VARCHAR(16),
                    action VARCHAR(100) NOT NULL,
                    entity_type VARCHAR(100) NOT NULL,
                    entity_id INTEGER NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )

        await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id INTEGER"))
        await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER"))

        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint c
                        JOIN pg_attribute a
                          ON a.attrelid = c.conrelid
                         AND a.attnum = ANY(c.conkey)
                        WHERE c.conrelid = 'projects'::regclass
                          AND c.contype = 'f'
                          AND a.attname = 'org_id'
                    ) THEN
                        ALTER TABLE projects
                        ADD CONSTRAINT fk_projects_org_id
                        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
                    END IF;
                END
                $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint c
                        JOIN pg_attribute a
                          ON a.attrelid = c.conrelid
                         AND a.attnum = ANY(c.conkey)
                        WHERE c.conrelid = 'projects'::regclass
                          AND c.contype = 'f'
                          AND a.attname = 'created_by_user_id'
                    ) THEN
                        ALTER TABLE projects
                        ADD CONSTRAINT fk_projects_created_by_user_id
                        FOREIGN KEY (created_by_user_id) REFERENCES users(id);
                    END IF;
                END
                $$;
                """
            )
        )

        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id ON projects(created_by_user_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_memberships_org_id ON memberships(org_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id)"))
        await conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS api_key_prefix VARCHAR(16)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_api_key_prefix ON audit_logs(api_key_prefix)"))

        await conn.execute(
            text(
                """
                INSERT INTO organizations (name)
                SELECT 'Default Org'
                WHERE NOT EXISTS (SELECT 1 FROM organizations)
                """
            )
        )
        await conn.execute(
            text(
                """
                UPDATE projects
                SET org_id = (SELECT id FROM organizations ORDER BY id ASC LIMIT 1)
                WHERE org_id IS NULL
                """
            )
        )
        await conn.execute(text("ALTER TABLE projects ALTER COLUMN org_id SET NOT NULL"))


async def ensure_fts_schema() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE memories ADD COLUMN IF NOT EXISTS search_tsv tsvector")
        )
        await conn.execute(
            text(
                """
                CREATE OR REPLACE FUNCTION memories_search_tsv_update() RETURNS trigger AS $$
                BEGIN
                    NEW.search_tsv :=
                        setweight(to_tsvector('english', coalesce(NEW.type, '')), 'B') ||
                        setweight(to_tsvector('english', coalesce(NEW.content, '')), 'A');
                    RETURN NEW;
                END
                $$ LANGUAGE plpgsql
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_trigger
                        WHERE tgname = 'trg_memories_search_tsv_update'
                    ) THEN
                        CREATE TRIGGER trg_memories_search_tsv_update
                        BEFORE INSERT OR UPDATE OF type, content
                        ON memories
                        FOR EACH ROW
                        EXECUTE FUNCTION memories_search_tsv_update();
                    END IF;
                END
                $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                UPDATE memories
                SET search_tsv =
                    setweight(to_tsvector('english', coalesce(type, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(content, '')), 'A')
                WHERE search_tsv IS NULL
                """
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_memories_search_tsv ON memories USING GIN (search_tsv)"
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id)")
        )
