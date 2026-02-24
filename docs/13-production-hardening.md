# Production Hardening — Bug Fixes & Lessons Learned

> **Date:** February 23, 2026  
> **Applies to:** ContextCache v2 (Refinery + TOON release)  
> **Status:** All fixes merged to `main` and deployed.

This document records every production bug encountered during the first live
deployment of the v2 feature set, the root cause of each, the exact code fix
applied, and the lesson learned. It is intended as a reference for future
contributors and a post-mortem record.

---

## Bug 1 — Hilbert Index Overflow (BIGINT range exceeded)

### Symptom

`POST /ingest/raw` returned `500 Internal Server Error`. API logs showed:

```
sqlalchemy.exc.DBAPIError: (asyncpg.exceptions.DataError):
  invalid input for query argument $11:
  78711140497883804285623371429 (value out of int64 range)
```

### Root Cause

The Hilbert curve index is computed by `hilbert_index_from_embedding()` in
`api/app/analyzer/sfc.py`. Its size is `2^(HILBERT_BITS × HILBERT_DIMS)`.

With the default values:

| Variable | Value |
|----------|-------|
| `HILBERT_BITS` | 12 |
| `HILBERT_DIMS` | 8 |
| **Max index** | **2^96 ≈ 7.9 × 10^28** |

PostgreSQL `BIGINT` is a signed 64-bit integer with a maximum of `2^63 − 1 ≈
9.2 × 10^18`. Any Hilbert index larger than that overflows and the INSERT
fails.

The `hilbert_index` column on the `memories` table is declared as `BigInteger`,
which cannot accommodate 96-bit values.

### Fix

`api/app/analyzer/algorithm.py` — `compute_hilbert_index()` wrapper:

```python
_BIGINT_MAX = (1 << 63) - 1  # PostgreSQL BIGINT upper bound

def compute_hilbert_index(vec: list[float]) -> int | None:
    raw = hilbert_index_from_embedding(vec)
    if raw is None:
        return None
    return int(raw) & _BIGINT_MAX   # keep lower 63 bits
```

**Why bitwise AND rather than modulo or clamping?**

- `int(raw) % (_BIGINT_MAX + 1)` works mathematically but can produce values
  near the max that cluster at the boundary.
- `int(raw) & _BIGINT_MAX` takes the **63 least-significant bits**, preserving
  fine-grained Hilbert locality (nearby vectors → similar lower bits). The
  discarded high bits represent only the coarsest spatial structure.
- Clamping (`min(raw, _BIGINT_MAX)`) would map all large values to the same
  maximum index, completely destroying locality for a large fraction of vectors.

### Affected File

```
api/app/analyzer/algorithm.py
```

### Lesson Learned

When using Hilbert curves as a database index, always verify that
`HILBERT_BITS × HILBERT_DIMS ≤ 63` for a PostgreSQL `BIGINT` column. If you
need more precision, change the column type to `NUMERIC` (unbounded integer) or
reduce the dimensionality. The code now defensively clamps even if the env vars
are set to large values.

**Safe configuration for BIGINT:**  
`HILBERT_BITS × HILBERT_DIMS ≤ 63`  
Example: `HILBERT_BITS=7, HILBERT_DIMS=8` → max index `2^56` ✓

---

## Bug 2 — Foreign Key Violation: `memories → auth_users` instead of `users`

### Symptom

After the Hilbert fix, the next attempt returned `500`. API logs showed:

```
sqlalchemy.exc.IntegrityError: (asyncpg.exceptions.ForeignKeyViolationError):
  insert or update on table "memories" violates foreign key constraint
  "memories_created_by_user_id_fkey"
  DETAIL: Key (created_by_user_id)=(3) is not present in table "auth_users".
```

### Root Cause

The `memories` table has a `created_by_user_id` column. Somewhere in the
migration history, this column's FK was accidentally created pointing to
`auth_users.id` instead of `users.id`.

The application has two separate user tables with different purposes:

| Table | Purpose |
|-------|---------|
| `users` | Core workspace identity — owns projects, memberships, memories |
| `auth_users` | Magic-link login sessions and email verification only |

When the API creates a memory using an **API key** (not a web session), the
actor is identified as a `users.id` row (e.g. user 3). That user never appears
in `auth_users` because they authenticated via API key, not via web login.
PostgreSQL correctly rejected the INSERT.

This bug would silently block **all headless API-key-based memory creation**
on any install where the user had never logged in via the web dashboard first.

### Fix

**`api/app/models.py`** — corrected the FK declaration:

```python
class Memory(Base):
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),  # was: auth_users.id
        nullable=True,
        index=True,
    )
```

**`api/alembic/versions/f36b427e433f_fix_memories_fk_to_users.py`** — migration
to repair the live database constraint without data loss:

```python
def upgrade() -> None:
    op.drop_constraint('memories_created_by_user_id_fkey', 'memories',
                       type_='foreignkey')
    op.create_foreign_key(
        'memories_created_by_user_id_fkey',
        'memories', 'users',
        ['created_by_user_id'], ['id'],
        ondelete='SET NULL',
    )
```

The migration runs automatically on API startup via `alembic upgrade head`.
No data was lost; the constraint was dropped and recreated on the existing rows.

### Affected Files

```
api/app/models.py
api/alembic/versions/f36b427e433f_fix_memories_fk_to_users.py
```

### Lesson Learned

Keep the two user tables clearly documented. Any column that represents "who
created/owns this record" should FK to `users.id`, not `auth_users.id`.
`auth_users` is an authentication-layer concern; `users` is the application-
layer identity. A FK to `auth_users` from a business entity table is always
wrong.

---

## Bug 3 — `ModuleNotFoundError: No module named 'celery'`

### Symptom

After fixing bugs 1 and 2, the API started but crashed on the first request
that triggered memory creation:

```
File "/app/app/worker/tasks.py", line 16, in <module>
    from .celery_app import celery_app
  File "/app/app/worker/celery_app.py", line 13, in <module>
    from celery import Celery
ModuleNotFoundError: No module named 'celery'
```

### Root Cause

`routes.py::create_memory()` contains a lazy import:

```python
from app.worker.tasks import compute_memory_embedding, _enqueue_if_enabled
```

This import chain is: `tasks.py` → `celery_app.py` → `from celery import Celery`.

`celery` was **never listed in `api/pyproject.toml`**. The `worker` Docker
Compose service uses the same `./api` build context as the `api` service, but
Celery was never added to the project's dependencies. It worked nowhere because
it was installed nowhere.

### Fix

```bash
cd api && uv add celery
```

This updated both `pyproject.toml` and `uv.lock`:

```toml
# api/pyproject.toml
dependencies = [
  ...
  "celery>=5.6.2",   # ← added
]
```

Additionally, `celery_app.py` was hardened with a guard import that produces a
clear, actionable error instead of a confusing traceback:

```python
try:
    from celery import Celery
except ImportError as _celery_missing:
    raise ImportError(
        "celery is not installed. Add it to api/pyproject.toml: uv add celery"
    ) from _celery_missing
```

### Affected Files

```
api/pyproject.toml
api/uv.lock
api/app/worker/celery_app.py
```

### Lesson Learned

When a package is used by multiple services built from the same image, it must
be in the shared `pyproject.toml`. Do not rely on a service implicitly having
a package because another service in the same image "needs" it. Run
`uv add <package>` explicitly.

Also: lazy imports that pull in optional heavy dependencies (like celery) hide
missing-dependency errors until a specific code path is exercised. Prefer
top-level imports or add a startup check for required optional packages.

---

## Bug 4 — Duplicate `/ingest/raw` Endpoint: Direct Save vs. Queue

### Symptom

`POST /ingest/raw` returned `201 Created` with a `Memory` object instead of
`202 Accepted` with `{ "status": "queued", "capture_id": N }`. The memory was
written directly to the `memories` table; the Inbox was never populated.

### Root Cause

Two separate endpoints were both registered at `POST /ingest/raw`:

1. **`api/app/ingest_routes.py::ingest_raw`** — the correct Refinery flow:
   saves to `raw_captures`, enqueues the task, returns 202.

2. **`api/app/routes.py::ingest_raw_capture`** — a shortcut added during
   development that called `create_memory()` directly, bypassing the entire
   Refinery pipeline.

FastAPI resolves route conflicts by **first-registered wins**. Because
`router` (from `routes.py`) was included before `ingest_router` in `main.py`,
the direct-save endpoint always won and the Refinery endpoint was never reached.

### Fix

The duplicate endpoint `ingest_raw_capture` was removed from `routes.py`.
The `ingest_router` in `ingest_routes.py` is now the sole handler for
`POST /ingest/raw`. The stale `RawCaptureIn` import in `routes.py` was also
removed.

### Affected File

```
api/app/routes.py  (removed ~35 lines: the ingest_raw_capture handler + import)
```

### Lesson Learned

Route conflicts in FastAPI are silent — the framework does not warn when two
routers register the same path+method. Always `grep -r "/ingest/raw"` across
all route files when adding a new endpoint to catch conflicts before deployment.

---

## Bug 5 — Inbox Always Empty When Worker Is Disabled

### Symptom

After fixing bug 4, `POST /ingest/raw` correctly returned `202 Accepted` and
saved a `RawCapture` row. However, `GET /projects/{id}/inbox` always returned
an empty list. No `InboxItem` rows were ever created.

### Root Cause

`ingest_routes.py::ingest_raw()` called `_enqueue_if_enabled(process_raw_capture_task, capture_id)`.

`_enqueue_if_enabled` checks `WORKER_ENABLED`:

```python
def _enqueue_if_enabled(task_fn, *args, **kwargs):
    if not WORKER_ENABLED:
        logger.debug("Worker disabled — skipping task %s(%s)", task_fn.name, args)
        return None          # ← silently does nothing
    return task_fn.delay(*args, **kwargs)
```

And `process_raw_capture_task` itself also bails early:

```python
def process_raw_capture_task(self, capture_id):
    skipped = _skip_if_disabled("process_raw_capture_task")
    if skipped is not None:
        return skipped       # ← returns immediately without processing
```

With `WORKER_ENABLED=false` (the default), the chain was:

```
POST /ingest/raw → RawCapture saved → _enqueue_if_enabled → noop → 202
```

The `InboxItem` rows were never created. The Inbox was permanently empty.

### Fix

`api/app/ingest_routes.py` was rewritten to add an **inline refinery fallback**.
When `WORKER_ENABLED=false`, the refinery logic runs synchronously in the same
DB session within the HTTP request:

```python
_WORKER_ENABLED = os.getenv("WORKER_ENABLED", "false").strip().lower() == "true"

async def _run_refinery_inline(db: AsyncSession, capture: RawCapture) -> int:
    """Run LLM extraction inline when the Celery worker is disabled."""
    from .worker.tasks import refine_content_with_llm
    drafts = refine_content_with_llm(capture.payload)
    inserted = 0
    for draft in drafts:
        db.add(InboxItem(
            project_id=capture.project_id,
            raw_capture_id=capture.id,
            suggested_type=str(draft.get("type", "note"))[:50],
            suggested_title=str(draft.get("title", ""))[:500] or None,
            suggested_content=str(draft.get("content", "")).strip(),
            confidence_score=max(0.0, min(1.0, float(draft.get("confidence_score", 0.8)))),
            status="pending",
        ))
        inserted += 1
    capture.processed_at = datetime.now(timezone.utc)
    return inserted

@ingest_router.post("/raw", response_model=RawCaptureQueuedOut, status_code=202)
async def ingest_raw(...):
    ...
    if _WORKER_ENABLED:
        await db.commit()
        _enqueue_if_enabled(process_raw_capture_task, capture_id)
    else:
        await _run_refinery_inline(db, capture)  # inline path
        await db.commit()
    return RawCaptureQueuedOut(status="queued", capture_id=capture_id)
```

**Result by configuration:**

| `WORKER_ENABLED` | Behaviour |
|------------------|-----------|
| `false` (default) | Refinery runs inline — Inbox populated before 202 is returned |
| `true` | Capture enqueued to Celery — Inbox populated asynchronously |

Both paths call the same `refine_content_with_llm()` function, so swapping in
a real LLM benefits both modes simultaneously.

### Affected File

```
api/app/ingest_routes.py  (full rewrite)
```

### Lesson Learned

"Fire and forget" is a poor default for features where the user can't tell
whether something worked. If a task is optional/async, always add a synchronous
fallback so the feature is usable in minimal deployments. Use the async path as
an optimisation for scale, not as the only path.

---

## Bug 6 — `ImportError: cannot import name 'ProjectUpdate'`

### Symptom

After pulling the latest code to the server and restarting, the API container
crashed in a restart loop:

```
ImportError: cannot import name 'ProjectUpdate' from 'app.schemas'
  (/app/app/schemas.py)
```

### Root Cause

A previous agent had deleted a `PATCH /projects/{id}` endpoint from `routes.py`
but left behind the `ProjectUpdate` import in the same `from .schemas import ...`
block. `ProjectUpdate` was never defined in `schemas.py`, so the import failed
and the entire application could not start.

```python
# routes.py (broken state)
from .schemas import (
    ...
    ProjectUpdate,   # ← class does not exist in schemas.py
    ...
)
```

### Fix

Removed the orphaned import from `routes.py`:

```python
# routes.py (fixed)
from .schemas import (
    ...
    ProjectCreate,
    ProjectOut,
    # ProjectUpdate removed
    RecallItemOut,
    ...
)
```

A full audit confirmed this was the only missing import. `RoleType`, which also
appeared in the import block and is not a `class`, is defined as a `Literal`
type alias at the top of `schemas.py` and imports correctly.

### Affected File

```
api/app/routes.py
```

### Lesson Learned

When removing a route handler, always remove its associated schema imports at
the same time. A simple `grep -n "ProjectUpdate" api/app/` before committing
would have caught this immediately. Consider adding a CI step that imports the
application (`python -c "from app.main import app"`) to catch ImportErrors
before they reach production.

---

## Summary Table

| # | Bug | Impact | File Fixed | Commit |
|---|-----|--------|-----------|--------|
| 1 | Hilbert index 96-bit → BIGINT overflow | All memory writes fail | `algorithm.py` | Clamp with `& BIGINT_MAX` |
| 2 | `memories.created_by_user_id` → `auth_users` wrong FK | API-key users can't create memories | `models.py` + migration `f36b427e433f` | Drop+recreate FK to `users.id` |
| 3 | `celery` not installed | Any request hitting task import crashes | `pyproject.toml` + `uv.lock` | `uv add celery` |
| 4 | Duplicate `/ingest/raw` endpoint | Refinery bypassed, memories written directly | `routes.py` | Remove shortcut handler |
| 5 | Inbox always empty without worker | Refinery pipeline nonfunctional in default config | `ingest_routes.py` | Add inline refinery fallback |
| 6 | Stale `ProjectUpdate` import | API fails to start entirely | `routes.py` | Remove orphaned import |

---

## Recommended Pre-Deploy Checklist

Based on the bugs above, the following checks should be run before every
production deploy:

```bash
# 1. Syntax check all Python files
python3 -m py_compile api/app/main.py api/app/routes.py \
  api/app/ingest_routes.py api/app/inbox_routes.py

# 2. Verify the application imports cleanly (catches ImportError)
cd api && uv run python -c "from app.main import app; print('import OK')"

# 3. Check for duplicate route paths across routers
grep -r "@.*\.post\|@.*\.get\|@.*\.patch\|@.*\.delete" api/app/ \
  | grep -oP '\".*?\"' | sort | uniq -d

# 4. Run the test suite
docker compose --profile test up --abort-on-container-exit api-test
```
