"""Celery application factory.

Imported by workers and optionally by the API (to enqueue tasks).
If Redis is not reachable the Celery app is still importable; task
submission will raise a connection error which the API should catch.

Configuration is purely via environment variables — no secrets in code.
"""
from __future__ import annotations

import os

try:
    from celery import Celery
except ImportError as _celery_missing:
    raise ImportError(
        "celery is not installed. Add it to api/pyproject.toml: uv add celery"
    ) from _celery_missing

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = "UTC"

celery_app = Celery(
    "contextcache",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer=CELERY_TASK_SERIALIZER,
    result_serializer=CELERY_RESULT_SERIALIZER,
    accept_content=CELERY_ACCEPT_CONTENT,
    timezone=CELERY_TIMEZONE,
    enable_utc=True,
    # Retry connection on startup — important inside Docker Compose
    broker_connection_retry_on_startup=True,
    # Keep results for 24 h then discard
    result_expires=86400,
    # Prevent runaway tasks
    task_soft_time_limit=300,   # 5 min soft limit → raises SoftTimeLimitExceeded
    task_time_limit=360,        # 6 min hard kill
    # Worker settings
    worker_prefetch_multiplier=1,   # fair dispatch — one task at a time per worker
    task_acks_late=True,            # ack after completion (safe re-queue on crash)
    # ── Periodic tasks (Celery Beat) ────────────────────────────────────────
    # Enable Beat scheduler with:  docker compose --profile worker up -d beat
    beat_schedule={
        # Purge expired/unconsumed magic links every hour
        "cleanup-expired-magic-links": {
            "task": "contextcache.cleanup_expired_magic_links",
            "schedule": 3600,  # seconds
        },
        # Refresh org-local p95 CAG latency cache for recall hedging.
        "refresh-recall-hedge-p95-cache": {
            "task": "contextcache.refresh_recall_hedge_p95_cache",
            "schedule": 300,  # every 5 minutes
            "kwargs": {"lookback_hours": 24, "min_samples": 5},
        },
        # Remove usage_counter rows older than 90 days — runs at 01:00 UTC daily
        "cleanup-old-usage-counters": {
            "task": "contextcache.cleanup_old_usage_counters",
            "schedule": 86400,
            "kwargs": {"retain_days": 90},
            "options": {"eta": None},  # Celery Beat schedules by interval; crontab overrides below
        },
        # Remove login event rows older than 90 days — runs nightly
        "cleanup-old-login-events": {
            "task": "contextcache.cleanup_old_login_events",
            "schedule": 86400,
            "kwargs": {"retain_days": 90},
        },
        "cleanup-old-waitlist-entries": {
            "task": "contextcache.cleanup_old_waitlist_entries",
            "schedule": 86400,
            "kwargs": {"retain_days": 90},
        },
        "cleanup-expired-sessions": {
            "task": "contextcache.cleanup_expired_sessions",
            "schedule": 86400,
        },
        "cleanup-expired-invites": {
            "task": "contextcache.cleanup_expired_invites",
            "schedule": 86400,
        },
        # Retry any raw_captures stuck in unprocessed state for > 1 hour.
        "retry-stale-raw-captures": {
            "task": "contextcache.retry_stale_raw_captures",
            "schedule": 3600,  # every hour
            "kwargs": {"stale_minutes": 60},
        },
    },
)
