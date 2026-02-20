from __future__ import annotations

import hashlib
import os
import secrets
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker
from pgvector.asyncpg import register_vector
import time
import logging

DATABASE_URL: str = os.environ["DATABASE_URL"]

engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=False, future=True)


@event.listens_for(engine.sync_engine, "connect")
def _pgvector_connect(dbapi_connection, _connection_record) -> None:
    """Register pgvector codecs for asyncpg connections."""
    async def _safe_register(conn) -> None:
        try:
            await register_vector(conn)
        except Exception as exc:
            # During first boot/migration, `vector` may not exist yet.
            # Also tolerate codec registration failures so API/migrations don't crash-loop.
            if "unknown type: public.vector" in str(exc):
                return
            print(f"[db] pgvector codec registration skipped: {exc}")
            return

    dbapi_connection.run_async(_safe_register)


@event.listens_for(engine.sync_engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault('query_start_time', []).append(time.time())

@event.listens_for(engine.sync_engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    start_time = conn.info['query_start_time'].pop(-1)
    total = time.time() - start_time
    if total > 0.2:  # Log queries running over 200ms
        logging.warning("Slow Query Detected: %f seconds for statement: %s", total, statement)

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
