from __future__ import annotations

import os
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
