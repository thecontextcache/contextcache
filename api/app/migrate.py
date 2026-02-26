from __future__ import annotations

import asyncio
import importlib
import os
from pathlib import Path
import sys

from sqlalchemy import text

from .db import engine

BASELINE_REVISION = os.getenv("ALEMBIC_BASELINE_REVISION", "20260212_0001").strip() or "20260212_0001"
DB_WAIT_MAX_ATTEMPTS = int(os.getenv("DB_WAIT_MAX_ATTEMPTS", "30"))
DB_WAIT_SECONDS = float(os.getenv("DB_WAIT_SECONDS", "2"))


def _import_real_alembic() -> tuple[object, type]:
    """Import installed Alembic package even when local /app/alembic exists."""
    app_root = Path(__file__).resolve().parents[1]
    original_sys_path = list(sys.path)
    try:
        # Remove project roots that can shadow `alembic` with /app/alembic directory.
        filtered: list[str] = []
        for entry in original_sys_path:
            probe = Path(entry or ".").resolve()
            if probe == app_root:
                continue
            filtered.append(entry)
        sys.path = filtered
        command_mod = importlib.import_module("alembic.command")
        config_mod = importlib.import_module("alembic.config")
        return command_mod, config_mod.Config
    finally:
        sys.path = original_sys_path


command, Config = _import_real_alembic()


def _alembic_config() -> Config:
    project_root = Path(__file__).resolve().parents[1]
    cfg = Config(str(project_root / "alembic.ini"))
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


def _alembic_upgrade_head() -> None:
    print("[migrate] Running alembic upgrade head")
    command.upgrade(_alembic_config(), "head")


def _alembic_stamp_baseline() -> None:
    print(f"[migrate] Stamping existing schema at revision {BASELINE_REVISION}")
    command.stamp(_alembic_config(), BASELINE_REVISION)


async def _run_upgrade_head() -> None:
    await asyncio.to_thread(_alembic_upgrade_head)


async def _run_stamp_baseline() -> None:
    await asyncio.to_thread(_alembic_stamp_baseline)


async def _detect_schema_state() -> tuple[bool, bool, bool]:
    async with engine.connect() as conn:
        core_table_exists = bool(
            (
                await conn.execute(
                    text("SELECT to_regclass('public.organizations') IS NOT NULL")
                )
            ).scalar_one()
        )
        alembic_table_exists = bool(
            (
                await conn.execute(
                    text("SELECT to_regclass('public.alembic_version') IS NOT NULL")
                )
            ).scalar_one()
        )

        has_version_row = False
        if alembic_table_exists:
            has_version_row = bool(
                (
                    await conn.execute(text("SELECT EXISTS (SELECT 1 FROM alembic_version)"))
                ).scalar_one()
            )

    return core_table_exists, alembic_table_exists, has_version_row


async def run_migrations() -> None:
    last_error: Exception | None = None
    for attempt in range(1, DB_WAIT_MAX_ATTEMPTS + 1):
        try:
            core_exists, alembic_table_exists, has_version_row = await _detect_schema_state()
            print(
                "[migrate] Schema probe: "
                f"core_exists={core_exists}, "
                f"alembic_table_exists={alembic_table_exists}, "
                f"has_version_row={has_version_row}"
            )

            if core_exists and not has_version_row:
                print("[migrate] Existing schema detected without Alembic version state")
                await _run_stamp_baseline()
                await _run_upgrade_head()
            elif not core_exists and not has_version_row:
                print("[migrate] Fresh database detected")
                await _run_upgrade_head()
            else:
                await _run_upgrade_head()

            print("[migrate] Migration bootstrap complete")
            return
        except Exception as exc:  # pragma: no cover
            last_error = exc
            if attempt >= DB_WAIT_MAX_ATTEMPTS:
                break
            print(
                f"[migrate] Waiting for database ({attempt}/{DB_WAIT_MAX_ATTEMPTS}) after error: {exc}"
            )
            await asyncio.sleep(DB_WAIT_SECONDS)

    assert last_error is not None
    raise last_error


def main() -> None:
    asyncio.run(run_migrations())


if __name__ == "__main__":
    main()
