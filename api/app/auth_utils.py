from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import os

MAGIC_LINK_TTL_MINUTES = int(os.getenv("MAGIC_LINK_TTL_MINUTES", "10"))
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "7"))
MAX_SESSIONS_PER_USER = int(os.getenv("MAX_SESSIONS_PER_USER", "3"))
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "contextcache_session")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token(prefix: str = "") -> str:
    raw = secrets.token_urlsafe(32)
    return f"{prefix}{raw}" if prefix else raw


def magic_link_expiry() -> datetime:
    return now_utc() + timedelta(minutes=MAGIC_LINK_TTL_MINUTES)


def session_expiry() -> datetime:
    return now_utc() + timedelta(days=SESSION_TTL_DAYS)


def ip_prefix(ip: str | None) -> str | None:
    if not ip:
        return None
    ip = ip.strip()
    if ":" in ip:
        parts = ip.split(":")
        return ":".join(parts[:4]) + "::/64"
    parts = ip.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3]) + ".0/24"
    return ip


def ua_hash(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    return hashlib.sha256(user_agent.encode("utf-8")).hexdigest()[:32]
