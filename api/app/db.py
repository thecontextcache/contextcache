from __future__ import annotations

import hashlib
import os
import secrets
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker
from pgvector.asyncpg import register_vector

DATABASE_URL: str = os.environ["DATABASE_URL"]

engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=False, future=True)


@event.listens_for(engine.sync_engine, "connect")
def _pgvector_connect(dbapi_connection, _connection_record) -> None:
    """Register pgvector codecs for asyncpg connections."""
    async def _safe_register(conn) -> None:
        try:
            await register_vector(conn)
        except ValueError as exc:
            # Happens before `CREATE EXTENSION vector` runs on first startup/migration.
            # Safe to ignore here; connections created after migrations will register.
            if "unknown type: public.vector" in str(exc):
                return
            raise

    dbapi_connection.run_async(_safe_register)

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
