"""
Bootstrap / recovery CLI: insert an admin AuthUser + AuthInvite so they can sign in.

Usage (on the server):
    docker compose exec api uv run python -m app.create_admin your@email.com

This is idempotent — safe to run multiple times with the same email.
After running, go to the web app, enter the email, and use the magic link / debug link.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import timedelta

from sqlalchemy import func, select

from .db import AsyncSessionLocal
from .auth_utils import now_utc
from .models import AuthInvite, AuthUser


async def create_admin(email: str) -> None:
    email = email.strip().lower()
    if not email or "@" not in email:
        print(f"ERROR: '{email}' does not look like a valid email address.")
        sys.exit(1)

    async with AsyncSessionLocal() as db:
        # Upsert AuthUser as admin
        auth_user = (
            await db.execute(
                select(AuthUser).where(func.lower(AuthUser.email) == email).limit(1)
            )
        ).scalar_one_or_none()

        if auth_user is None:
            auth_user = AuthUser(
                email=email,
                is_admin=True,
                invite_accepted_at=now_utc(),
            )
            db.add(auth_user)
            await db.flush()
            print(f"Created AuthUser: {email} (is_admin=True)")
        else:
            if not auth_user.is_admin:
                auth_user.is_admin = True
                print(f"Promoted existing AuthUser to admin: {email}")
            else:
                print(f"AuthUser already exists and is admin: {email}")

        # Ensure a long-lived invite exists so the request-link endpoint lets them through
        existing_invite = (
            await db.execute(
                select(AuthInvite)
                .where(func.lower(AuthInvite.email) == email)
                .where(AuthInvite.revoked_at.is_(None))
                .where(AuthInvite.expires_at > now_utc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if existing_invite is None:
            invite = AuthInvite(
                email=email,
                invited_by_user_id=None,
                expires_at=now_utc() + timedelta(days=3650),  # 10 years
                notes="Bootstrap admin — created by create_admin CLI",
            )
            db.add(invite)
            print(f"Created permanent invite for: {email}")
        else:
            print(f"Active invite already exists for: {email}")

        await db.commit()

    print()
    print(f"  ✓ Admin ready: {email}")
    print(f"  → Go to the web app, enter this email, and click the magic link.")
    print(f"  → In dev mode the debug link appears on-screen.")
    print(f"  → In prod check: docker compose logs api | grep 'MAGIC LINK'")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: uv run python -m app.create_admin your@email.com")
        sys.exit(1)
    asyncio.run(create_admin(sys.argv[1]))
