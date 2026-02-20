"""Seed realistic mock data for a specific admin user.

Runs inside the `api` Docker container — connects directly to Postgres,
bypasses HTTP auth and daily-limit enforcement.

Usage (run from server):
    docker compose exec api uv run python scripts/seed_mock_data.py \
        --email dn@thecontextcache.com

Options:
    --email    Target admin auth_user email  (required)
    --org      Org name to create/reuse      (default: "ContextCache HQ")
    --projects N   Number of projects        (default: 5)
    --mems-per N   Memories per project      (default: 12)
    --dry-run  Print plan, make no changes
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import random
from datetime import datetime, timezone, timedelta

# ── Ensure app package is importable when running from repo root ──────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    AuthUser,
    Organization,
    User,
    Membership,
    Project,
    Memory,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://contextcache:change-me@db:5432/contextcache",
)

# ── Realistic sample data ─────────────────────────────────────────────────────

PROJECTS = [
    {
        "name": "Auth & Session Layer",
        "memories": [
            ("decision", "Use HttpOnly session cookies with SameSite=Lax for all authenticated endpoints. "
             "Never expose session tokens in URLs or JSON bodies.",
             "Chose over JWT to avoid client-side token storage risks."),
            ("finding", "Cloudflare strips CF-Connecting-IP when tunnel mode is set to 'Browser Isolation'. "
             "Must read from X-Forwarded-For as fallback.",
             "Discovered after IP logging returned 127.0.0.1 in prod."),
            ("decision", "Magic link tokens expire after 10 minutes and are single-use. "
             "Token hash stored in DB; raw token never persisted.",
             "Security: prevents replay attacks even if DB is compromised."),
            ("note", "Rate limit: 5 magic-link requests per IP per hour, 3 per email per hour. "
             "Tracked in-process; move to Redis when scaling to multiple API instances.",
             None),
            ("todo", "Add TOTP / passkey as second factor once base auth is stable.", None),
            ("finding", "SES sandbox only allows verified recipient addresses. "
             "Production access pending AWS review (submitted 2026-01-15).",
             None),
        ],
    },
    {
        "name": "Memory Recall Engine",
        "memories": [
            ("decision", "Postgres full-text search with ts_rank_cd is the primary recall mechanism. "
             "Recency (created_at DESC) is the tiebreaker when FTS rank is tied.",
             "pgvector deferred until embedding model is finalised."),
            ("finding", "tsvector index on (content, title) gives ~4ms P95 recall latency at 10k memories. "
             "Acceptable until we hit ~100k; re-evaluate then.",
             None),
            ("definition", "Memory pack: a formatted plaintext blob grouping recall results by type. "
             "Format: ## Decisions\\n- ...\\n## Findings\\n- ...\\nPaste directly into any LLM context window.",
             None),
            ("finding", "Token-overlap scoring (lexeme intersection / union) performs better than raw FTS rank "
             "for very short queries (< 3 tokens). Hybrid applied in analyzer.core.",
             None),
            ("decision", "Recall limit: 10 results by default, max 50 via ?limit=. "
             "Prevents runaway context windows.",
             None),
            ("code", "SELECT id, type, content, ts_rank_cd(search_tsv, q) AS rank "
             "FROM memories, plainto_tsquery('english', :q) q "
             "WHERE project_id = :pid AND search_tsv @@ q "
             "ORDER BY rank DESC, created_at DESC LIMIT :lim",
             "Core recall query — analyzer.core wraps this with Python scoring."),
        ],
    },
    {
        "name": "Infrastructure & Deployment",
        "memories": [
            ("decision", "Cloudflare Tunnel (Mode C) routes all three subdomains: "
             "thecontextcache.com → web:3000, api.thecontextcache.com → api:8000, "
             "docs.thecontextcache.com → docs:8001. No ports exposed to public internet.",
             None),
            ("decision", "Docker Compose profiles: default runs db+api+web+docs. "
             "Worker profile adds redis+worker+beat. Never mix in prod without intent.",
             None),
            ("finding", "Celery beat schedule requires a persistent SQLite beat schedule file. "
             "Mount /tmp/celerybeat-schedule as a Docker volume to survive restarts.",
             "Otherwise beat loses state on container restart and may re-fire tasks."),
            ("note", "APP_ENV=prod enables: Secure cookies, strict CORS, no debug magic links. "
             "Never run prod with APP_ENV=dev — exposes X-User-Email header bypass.",
             None),
            ("todo", "Add PgBouncer connection pooling once concurrent API instances > 2.", None),
            ("finding", "Environment variable DAILY_MEMORIES_LIMIT and DAILY_PROJECTS_LIMIT "
             "are NOT read by the backend. Use DAILY_MEMORY_LIMIT and DAILY_PROJECT_LIMIT instead.",
             "Bug found 2026-02-19; fixed in .env.example."),
        ],
    },
    {
        "name": "Frontend & UX",
        "memories": [
            ("decision", "Next.js middleware intercepts / and redirects authenticated users to /app. "
             "Uses cookie presence check — no API call needed at edge.",
             None),
            ("finding", "Global CSS `input { width: 100% }` rule caused checkbox inside label "
             "to expand full-width, pushing terms text outside the card. "
             "Fix: wrapper div not label + `width: auto` on checkbox.",
             "Fixed in auth/page.js 2026-02-19."),
            ("decision", "Anti-FOUC script in layout.js reads localStorage theme before React hydration. "
             "Sets data-theme='dark' synchronously to prevent flash of wrong theme.",
             None),
            ("decision", "BrainGraph uses canvas + requestAnimationFrame — zero React state updates "
             "inside the animation loop. All mutable state in refs.",
             "Prevents re-render cascade on every frame."),
            ("note", "Shell.js brand logo uses <a href='/'> not Next.js <Link> to force a full "
             "navigation so middleware re-runs and redirects authenticated users correctly.",
             None),
            ("finding", "prefers-reduced-motion OS setting is now respected by BrainGraph. "
             "Physics loop pauses automatically; user can toggle manually with ⏸ button.",
             None),
        ],
    },
    {
        "name": "Legal & Compliance",
        "memories": [
            ("decision", "Proprietary license — source visible but not open source. "
             "No redistribution, no derivative commercial products without written consent.",
             None),
            ("note", "™ symbol used throughout — trademark claim, not yet registered. "
             "File for registration post-LLC incorporation. Update to ® when granted.",
             None),
            ("decision", "Login IP retention: last 10 events per user stored transactionally. "
             "Celery beat purges events older than 90 days nightly at 03:00 UTC.",
             None),
            ("finding", "GDPR note: magic link tokens are hashed (SHA-256) before storage. "
             "Raw tokens are never logged or persisted. IP addresses are INET type in Postgres.",
             None),
            ("todo", "Draft Terms of Service v1.0 with legal counsel before GA launch.", None),
            ("definition", "is_unlimited flag: when true, all daily usage counters are bypassed for that user. "
             "Set via POST /admin/users/{id}/set-unlimited?unlimited=true. Admin-only.",
             None),
        ],
    },
]

TYPES = ["decision", "finding", "definition", "note", "link", "todo", "chat", "doc", "code"]
SOURCES = ["manual", "chatgpt", "claude", "cursor", "codex"]


def _ts(days_ago: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago, seconds=random.randint(0, 86400))


async def seed(
    email: str,
    org_name: str,
    num_projects: int,
    mems_per_project: int,
    dry_run: bool,
) -> None:
    engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # ── 1. Locate auth_user ───────────────────────────────────────────────
        auth_user: AuthUser | None = (
            await session.execute(
                select(AuthUser).where(func.lower(AuthUser.email) == email.lower())
            )
        ).scalar_one_or_none()

        if auth_user is None:
            print(f"[seed] ERROR: No auth_user found with email '{email}'.")
            print("       The user must log in at least once before seeding.")
            await engine.dispose()
            sys.exit(1)

        print(f"[seed] Found auth_user id={auth_user.id} email={auth_user.email} "
              f"is_admin={auth_user.is_admin}")

        # ── 2. Find or create legacy User (for org/project ownership) ─────────
        legacy_user: User | None = (
            await session.execute(
                select(User).where(func.lower(User.email) == email.lower())
            )
        ).scalar_one_or_none()

        if legacy_user is None:
            print(f"[seed] Creating legacy users row for {email}")
            if not dry_run:
                legacy_user = User(email=email, display_name=email.split("@")[0])
                session.add(legacy_user)
                await session.flush()
        else:
            print(f"[seed] Found legacy user id={legacy_user.id}")

        # ── 3. Find or create org ─────────────────────────────────────────────
        org: Organization | None = (
            await session.execute(
                select(Organization).where(Organization.name == org_name).limit(1)
            )
        ).scalar_one_or_none()

        if org is None:
            print(f"[seed] Creating org '{org_name}'")
            if not dry_run:
                org = Organization(name=org_name)
                session.add(org)
                await session.flush()
        else:
            print(f"[seed] Found org id={org.id} name='{org.name}'")

        # ── 4. Ensure membership ──────────────────────────────────────────────
        if not dry_run and legacy_user and org:
            existing_mem = (
                await session.execute(
                    select(Membership).where(
                        Membership.org_id == org.id,
                        Membership.user_id == legacy_user.id,
                    )
                )
            ).scalar_one_or_none()
            if existing_mem is None:
                print(f"[seed] Creating membership org={org.id} user={legacy_user.id}")
                session.add(Membership(org_id=org.id, user_id=legacy_user.id, role="owner"))
                await session.flush()

        # ── 5. Create projects & memories ─────────────────────────────────────
        projects_data = PROJECTS[:num_projects]
        total_mems = 0

        for proj_idx, pdata in enumerate(projects_data):
            print(f"[seed] {'[DRY] ' if dry_run else ''}Project {proj_idx + 1}: '{pdata['name']}'")

            if dry_run:
                mem_count = min(len(pdata["memories"]), mems_per_project)
                print(f"       → would create {mem_count} memories")
                continue

            proj = Project(
                name=pdata["name"],
                org_id=org.id,
                created_by_user_id=legacy_user.id,
                created_at=_ts(days_ago=random.randint(5, 30)),
            )
            session.add(proj)
            await session.flush()

            mems = pdata["memories"][:mems_per_project]
            for mem_type, content, title in mems:
                mem = Memory(
                    project_id=proj.id,
                    created_by_user_id=auth_user.id,
                    type=mem_type,
                    source=random.choice(SOURCES),
                    title=title,
                    content=content,
                    created_at=_ts(days_ago=random.randint(0, 14)),
                )
                session.add(mem)
                total_mems += 1

            await session.flush()
            print(f"       ✓ created project id={proj.id} with {len(mems)} memories")

        if not dry_run:
            await session.commit()
            print(f"\n[seed] Done. Created {len(projects_data)} projects, {total_mems} memories.")
            print(f"[seed] Log in at https://thecontextcache.com/app to verify.")
        else:
            print(f"\n[seed] Dry run complete — no changes made.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed mock data for a specific user.")
    parser.add_argument("--email",    required=True,  help="Target auth_user email")
    parser.add_argument("--org",      default="ContextCache HQ", help="Org name (created if absent)")
    parser.add_argument("--projects", type=int, default=5,  help="Number of projects (max 5)")
    parser.add_argument("--mems-per", type=int, default=6,  help="Memories per project (max 6)")
    parser.add_argument("--dry-run",  action="store_true",  help="Print plan, no DB changes")
    args = parser.parse_args()

    asyncio.run(seed(
        email=args.email,
        org_name=args.org,
        num_projects=min(args.projects, len(PROJECTS)),
        mems_per_project=min(args.mems_per, 6),
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    main()
