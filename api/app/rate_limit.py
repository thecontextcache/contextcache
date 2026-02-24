from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import os

try:
    import redis
except Exception:  # pragma: no cover - handled by runtime checks
    redis = None

APP_ENV = os.getenv("APP_ENV", "dev").strip().lower()
REDIS_URL = os.getenv("REDIS_URL", os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")).strip()
AUTH_RATE_LIMIT_PER_IP_PER_HOUR = int(os.getenv("AUTH_RATE_LIMIT_PER_IP_PER_HOUR", "5"))
AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR = int(os.getenv("AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR", "3"))
AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR = int(os.getenv("AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR", "20"))
RECALL_RATE_LIMIT_PER_IP_PER_HOUR = int(os.getenv("RECALL_RATE_LIMIT_PER_IP_PER_HOUR", "240"))
RECALL_RATE_LIMIT_PER_ACCOUNT_PER_HOUR = int(os.getenv("RECALL_RATE_LIMIT_PER_ACCOUNT_PER_HOUR", "240"))
HEDGE_P95_CACHE_TTL_SECONDS = int(os.getenv("HEDGE_P95_CACHE_TTL_SECONDS", "900"))

# Write-endpoint burst limits — prevents flooding DB with projects/memories/orgs
# via a valid API key. Configurable via env vars; 0 = disabled.
WRITE_RATE_LIMIT_PER_IP_PER_MINUTE = int(os.getenv("WRITE_RATE_LIMIT_PER_IP_PER_MINUTE", "60"))
WRITE_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE = int(os.getenv("WRITE_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE", "60"))
INGEST_RATE_LIMIT_PER_IP_PER_MINUTE = int(os.getenv("INGEST_RATE_LIMIT_PER_IP_PER_MINUTE", "30"))
INGEST_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE = int(os.getenv("INGEST_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE", "30"))

_REQUESTS: dict[str, deque[datetime]] = defaultdict(deque)
_REDIS_CLIENT = None


def _get_redis_client():
    global _REDIS_CLIENT
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    if redis is None or not REDIS_URL:
        return None
    try:
        _REDIS_CLIENT = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        _REDIS_CLIENT.ping()
        return _REDIS_CLIENT
    except Exception:
        _REDIS_CLIENT = None
        return None


def _allow_redis(key: str, limit: int, ttl_seconds: int) -> bool:
    client = _get_redis_client()
    if client is None:
        if APP_ENV == "prod":
            return False
        return _allow(key, limit)
    try:
        count = int(client.incr(key))
        if count == 1:
            client.expire(key, ttl_seconds)
        return count <= limit
    except Exception:
        if APP_ENV == "prod":
            return False
        return _allow(key, limit)


def get_counter(key: str) -> int:
    client = _get_redis_client()
    if client is None:
        return 0
    try:
        value = client.get(key)
        return int(value) if value is not None else 0
    except Exception:
        return 0


def incr_counter(key: str, ttl_seconds: int) -> int:
    client = _get_redis_client()
    if client is None:
        return 0
    try:
        count = int(client.incr(key))
        if count == 1:
            client.expire(key, ttl_seconds)
        return count
    except Exception:
        return 0


def get_cached_hedge_p95_ms(org_id: int) -> int | None:
    client = _get_redis_client()
    if client is None:
        return None
    try:
        value = client.get(f"hedge:p95:org:{org_id}")
        if value is None:
            return None
        parsed = int(value)
        return parsed if parsed > 0 else None
    except Exception:
        return None


def set_cached_hedge_p95_ms(org_id: int, delay_ms: int, ttl_seconds: int | None = None) -> bool:
    client = _get_redis_client()
    if client is None:
        return False
    ttl = ttl_seconds if ttl_seconds is not None else HEDGE_P95_CACHE_TTL_SECONDS
    try:
        client.setex(f"hedge:p95:org:{org_id}", max(1, ttl), max(1, int(delay_ms)))
        return True
    except Exception:
        return False


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
    if APP_ENV == "prod" and _get_redis_client() is None:
        return False, "Service unavailable. Rate limiter backend is unavailable."
    if not _allow_redis(f"rl:ip:{ip}", AUTH_RATE_LIMIT_PER_IP_PER_HOUR, 3600):
        return False, "Too many login requests from this IP. Please try again later."
    if not _allow_redis(f"rl:email:{email}", AUTH_RATE_LIMIT_PER_EMAIL_PER_HOUR, 3600):
        return False, "Too many login requests for this email. Please try again later."
    return True, None


def check_verify_limits(ip: str) -> tuple[bool, str | None]:
    if APP_ENV == "prod" and _get_redis_client() is None:
        return False, "Service unavailable. Rate limiter backend is unavailable."
    if not _allow_redis(f"verify:ip:{ip}", AUTH_VERIFY_RATE_LIMIT_PER_IP_PER_HOUR, 3600):
        return False, "Too many verification attempts. Please try again later."
    return True, None


def check_recall_limits(ip: str, account_key: str) -> tuple[bool, str | None]:
    if APP_ENV == "prod" and _get_redis_client() is None:
        return False, "Service unavailable. Rate limiter backend is unavailable."
    if not _allow_redis(f"recall:ip:{ip}", RECALL_RATE_LIMIT_PER_IP_PER_HOUR, 3600):
        return False, "Too many recall requests from this IP. Please try again later."
    if account_key and not _allow_redis(f"recall:acct:{account_key}", RECALL_RATE_LIMIT_PER_ACCOUNT_PER_HOUR, 3600):
        return False, "Too many recall requests for this account. Please try again later."
    return True, None


def check_write_limits(ip: str, account_key: str) -> tuple[bool, str | None]:
    """Burst rate limit for general write endpoints (projects, memories, orgs)."""
    if WRITE_RATE_LIMIT_PER_IP_PER_MINUTE > 0:
        if not _allow_redis(f"write:ip:{ip}", WRITE_RATE_LIMIT_PER_IP_PER_MINUTE, 60):
            return False, "Too many write requests from this IP. Please slow down."
    if account_key and WRITE_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE > 0:
        if not _allow_redis(f"write:acct:{account_key}", WRITE_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE, 60):
            return False, "Too many write requests for this account. Please slow down."
    return True, None


def check_ingest_limits(ip: str, account_key: str) -> tuple[bool, str | None]:
    """Burst rate limit for the /ingest/raw endpoint (higher volume, stricter limit)."""
    if INGEST_RATE_LIMIT_PER_IP_PER_MINUTE > 0:
        if not _allow_redis(f"ingest:ip:{ip}", INGEST_RATE_LIMIT_PER_IP_PER_MINUTE, 60):
            return False, "Too many ingest requests from this IP. Please slow down."
    if account_key and INGEST_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE > 0:
        if not _allow_redis(f"ingest:acct:{account_key}", INGEST_RATE_LIMIT_PER_ACCOUNT_PER_MINUTE, 60):
            return False, "Too many ingest requests for this account. Please slow down."
    return True, None
