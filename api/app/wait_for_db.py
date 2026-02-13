from __future__ import annotations

import asyncio
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = os.environ["DATABASE_URL"]
DB_WAIT_MAX_ATTEMPTS = int(os.getenv("DB_WAIT_MAX_ATTEMPTS", "60"))
DB_WAIT_SECONDS = float(os.getenv("DB_WAIT_SECONDS", "1"))


async def wait_for_db() -> None:
    engine = create_async_engine(DATABASE_URL, future=True)
    try:
        last_error: Exception | None = None
        for attempt in range(1, DB_WAIT_MAX_ATTEMPTS + 1):
            try:
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                print("[wait_for_db] Database is ready")
                return
            except Exception as exc:  # pragma: no cover
                last_error = exc
                if attempt >= DB_WAIT_MAX_ATTEMPTS:
                    break
                print(
                    f"[wait_for_db] Waiting for database ({attempt}/{DB_WAIT_MAX_ATTEMPTS}): {exc}"
                )
                await asyncio.sleep(DB_WAIT_SECONDS)

        assert last_error is not None
        raise last_error
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(wait_for_db())


if __name__ == "__main__":
    main()
