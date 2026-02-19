from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import os

AUTH_RATE_LIMIT_PER_IP_PER_HOUR = int(os.getenv("AUTH_RATE_LIMIT_PER_IP_PER_HOUR", "5"))
AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR = int(os.getenv("AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR", "3"))
AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR = int(os.getenv("AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR", "20"))

_REQUESTS: dict[str, deque[datetime]] = defaultdict(deque)


def _window_start() -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=1)


def _allow(key: str, limit: int) -> bool:
    now = datetime.now(timezone.utc)
    window = _window_start()
    q = _REQUESTS[key]
    while q and q[0] < window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def check_request_link_limits(ip: str, email: str) -> tuple[bool, str | None]:
    if not _allow(f"rl:ip:{ip}", AUTH_RATE_LIMIT_PER_IP_PER_HOUR):
        return False, "Too many login requests from this IP. Please try again later."
    if not _allow(f"rl:email:{email}", AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR):
        return False, "Too many login requests for this email. Please try again later."
    return True, None


def check_verify_limits(ip: str) -> tuple[bool, str | None]:
    if not _allow(f"verify:ip:{ip}", AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR):
        return False, "Too many verification attempts. Please try again later."
    return True, None
