"""Create an API key for a named user/org — works in any APP_ENV.

The bootstrap API key mechanism only runs in APP_ENV=dev.
Use this script to create a permanent API key directly in the DB.

Usage (run from server):
    docker compose exec api uv run python scripts/create_api_key.py \
        --email dn@thecontextcache.com \
        --org "ContextCache HQ" \
        --key-name "admin-cli-key"

The raw key is printed ONCE. Save it immediately.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import secrets
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models import ApiKey, Organization, User, Membership  # noqa: F401

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is required.", file=sys.stderr)
    print("  Run inside the container:  docker compose exec api uv run python scripts/create_api_key.py ...", file=sys.stderr)
    sys.exit(1)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_key(email: str, org_name: str, key_name: str) -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Find or create org
        org = (
            await session.execute(
                select(Organization).where(Organization.name == org_name).limit(1)
            )
        ).scalar_one_or_none()
        if org is None:
            print(f"[key] Creating org '{org_name}'")
            org = Organization(name=org_name)
            session.add(org)
            await session.flush()
        else:
            print(f"[key] Found org id={org.id} '{org.name}'")

        # Find or create legacy User
        user = (
            await session.execute(
                select(User).where(func.lower(User.email) == email.lower()).limit(1)
            )
        ).scalar_one_or_none()
        if user is None:
            print(f"[key] Creating user '{email}'")
            user = User(email=email, display_name=email.split("@")[0])
            session.add(user)
            await session.flush()
        else:
            print(f"[key] Found user id={user.id} '{user.email}'")

        # Ensure membership
        mem = (
            await session.execute(
                select(Membership).where(
                    Membership.org_id == org.id,
                    Membership.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if mem is None:
            print(f"[key] Creating owner membership")
            session.add(Membership(org_id=org.id, user_id=user.id, role="owner"))
            await session.flush()

        # Generate key
        raw_key = f"cck_{secrets.token_urlsafe(24)}"
        key_hash = _hash_key(raw_key)
        prefix = raw_key[:8]

        api_key = ApiKey(
            org_id=org.id,
            name=key_name,
            key_hash=key_hash,
            prefix=prefix,
        )
        session.add(api_key)
        await session.commit()

        print(f"\n{'=' * 60}")
        print(f"  API key created for {email} / org='{org_name}'")
        print(f"  Name   : {key_name}")
        print(f"  Prefix : {prefix}")
        print(f"\n  RAW KEY (save this — shown only once):")
        print(f"  {raw_key}")
        print(f"{'=' * 60}\n")
        print(f"Usage:")
        print(f"  cc login --api-key {raw_key} --org-id {org.id}")
        print(f"  curl -H 'X-API-Key: {raw_key}' https://api.thecontextcache.com/projects")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an API key for a user.")
    parser.add_argument("--email",    required=True,            help="User email")
    parser.add_argument("--org",      default="ContextCache HQ", help="Org name")
    parser.add_argument("--key-name", default="admin-key",      help="Key label")
    args = parser.parse_args()
    asyncio.run(create_key(args.email, args.org, args.key_name))


if __name__ == "__main__":
    main()
