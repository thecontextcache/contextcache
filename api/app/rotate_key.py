from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from .db import AsyncSessionLocal, engine, ensure_fts_schema, ensure_multitenant_schema, generate_api_key, hash_api_key
from .models import ApiKey, Base, Organization


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rotate ContextCache API key for an org.")
    parser.add_argument("--org-id", type=int, required=True, help="Organization id")
    parser.add_argument("--name", type=str, default="demo-key", help="API key name")
    return parser.parse_args()


async def rotate_key(org_id: int, name: str) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_multitenant_schema()
    await ensure_fts_schema()

    async with AsyncSessionLocal() as session:
        org = (
            await session.execute(select(Organization).where(Organization.id == org_id).limit(1))
        ).scalar_one_or_none()
        if org is None:
            raise RuntimeError(f"Organization {org_id} not found")

        active_named_keys = (
            await session.execute(
                select(ApiKey).where(
                    ApiKey.org_id == org_id,
                    ApiKey.name == name,
                    ApiKey.revoked_at.is_(None),
                )
            )
        ).scalars().all()
        for key in active_named_keys:
            key.revoked_at = datetime.now(timezone.utc)

        plaintext = generate_api_key()
        new_key = ApiKey(
            org_id=org_id,
            name=name,
            key_hash=hash_api_key(plaintext),
            prefix=plaintext[:8],
        )
        session.add(new_key)
        await session.commit()
        await session.refresh(new_key)

        print(f"Rotated key for org_id={org_id}, org_name={org.name}, key_name={name}")
        print(f"Revoked active named keys: {len(active_named_keys)}")
        print(f"New API key (store now, shown once): {plaintext}")
        print(f"New API key prefix: {new_key.prefix}")


async def main() -> None:
    args = parse_args()
    await rotate_key(org_id=args.org_id, name=args.name)


if __name__ == "__main__":
    asyncio.run(main())
