"""Worker package — Celery task definitions and queue setup.

Default state: WORKER_ENABLED=false → the worker container does not run
and no tasks are dispatched.  The API continues to function normally.

To enable:
  1. Set WORKER_ENABLED=true in your .env
  2. Set CELERY_BROKER_URL=redis://redis:6379/0
  3. Run:  docker compose --profile worker up -d

See docs/06-deployment.md for full instructions.
"""
