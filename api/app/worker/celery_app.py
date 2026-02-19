"""Celery application factory.

Imported by workers and optionally by the API (to enqueue tasks).
If Redis is not reachable the Celery app is still importable; task
submission will raise a connection error which the API should catch.

Configuration is purely via environment variables — no secrets in code.
"""
from __future__ import annotations

import os

from celery import Celery

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
)
