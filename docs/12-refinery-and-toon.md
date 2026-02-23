# The Refinery Pipeline & TOON Format

## Overview

ContextCache v2 introduces two major capabilities on top of the existing MVP:

1. **The Refinery** — an automated ingestion pipeline that accepts raw data
   (chat logs, terminal history, DOM dumps, emails) from capture sources,
   extracts structured memory drafts using an LLM, and presents them in an
   **Inbox** for human triage.

2. **TOON (Token-Oriented Object Notation)** — a compact output format for
   the Recall API that reduces token usage by ~40 % for agent/programmatic
   consumers.

---

## The Refinery Pipeline

### Motivation

The MVP required users to manually type every memory card. The Refinery
automates the "extraction" step: capture raw context once, let the LLM
surface the insights, then let a human approve or reject each one.

### Pipeline Overview

```
Capture source                 API                   Worker            Inbox
─────────────────   ──────────────────────────   ─────────────   ────────────────
CLI / Chrome ext  ──▶ POST /ingest/raw           process_raw     inbox_items
MCP / email       ──▶  → RawCapture saved        capture_task    (status=pending)
                       → task queued             → LLM extract       │
                                                 → InboxItems         ▼
                                                   inserted     Human reviews
                                                                  ↓ approve  → Memory (full pipeline)
                                                                  ↓ reject   → status=rejected
                                                                  ↓ edit+approve → edited Memory
```

---

## New Database Tables

### `raw_captures`

Stores the raw payload submitted by a capture source before any LLM processing.

| Column         | Type        | Description |
|----------------|-------------|-------------|
| `id`           | Integer PK  | Auto-increment |
| `org_id`       | FK → orgs   | Owning organisation |
| `project_id`   | FK → projects (nullable) | Target project hint |
| `source`       | String(50)  | `chrome_ext`, `cli`, `mcp`, `email` |
| `payload`      | JSONB       | Raw content (chat log, terminal, DOM, email body) |
| `captured_at`  | DateTime    | When the capture arrived |
| `processed_at` | DateTime?   | Set by the worker once LLM extraction is done |

### `inbox_items`

LLM-suggested memory drafts awaiting human triage.

| Column                | Type       | Description |
|-----------------------|------------|-------------|
| `id`                  | Integer PK | Auto-increment |
| `project_id`          | FK → projects | The project this draft belongs to |
| `raw_capture_id`      | FK → raw_captures (nullable) | Source capture |
| `promoted_memory_id`  | FK → memories (nullable) | Set on approval |
| `suggested_type`      | String     | Memory type guessed by the LLM |
| `suggested_title`     | String?    | Optional LLM-suggested title |
| `suggested_content`   | Text       | The extracted insight |
| `confidence_score`    | Float      | 0.0–1.0 LLM confidence |
| `status`              | String     | `pending` \| `approved` \| `rejected` \| `merged` |
| `created_at`          | DateTime   | When the draft was created |
| `reviewed_at`         | DateTime?  | When a human reviewed it |

---

## API Endpoints

### POST /ingest/raw

Accepts a raw capture payload and queues it for LLM extraction.

**Auth:** API key or session — requires `member` role.

**Request:**
```json
{
  "source": "cli",
  "payload": { "text": "We decided to use PostgreSQL for cost reasons..." },
  "project_id": 42
}
```

**Response (202):**
```json
{ "status": "queued", "capture_id": 17 }
```

The response is immediate. The Celery worker processes the capture
asynchronously.

---

### GET /projects/{id}/inbox

Returns inbox items for a project, newest first. Defaults to `status=pending`.

**Query params:**
- `status` — `pending` (default) | `approved` | `rejected` | `merged` | `all`
- `limit` — 1–200 (default 50)
- `offset` — pagination offset

**Response:**
```json
{
  "project_id": 42,
  "total": 3,
  "items": [
    {
      "id": 5,
      "project_id": 42,
      "suggested_type": "decision",
      "suggested_title": "Database selection",
      "suggested_content": "We chose PostgreSQL over MySQL due to JSONB support and cost.",
      "confidence_score": 0.85,
      "status": "pending",
      "created_at": "2026-02-23T12:00:00Z"
    }
  ]
}
```

---

### POST /inbox/{id}/approve

Approves a pending draft and promotes it to a full Memory.

**CRITICAL:** Promotion runs the complete memory-creation pipeline:
- `compute_embedding()` → `embedding_vector` (pgvector)
- `compute_hilbert_index()` → `hilbert_index` (B-tree prefilter)
- `content_hash` for deduplication
- FTS `search_tsv` updated via existing DB trigger
- Usage counters incremented
- Audit log entry written

Optionally accepts edits to override type, title, or content before saving.

**Request body (optional):**
```json
{
  "suggested_type": "decision",
  "suggested_title": "Edited title",
  "suggested_content": "The corrected content."
}
```

**Response:** The promoted `MemoryOut` object.

---

### POST /inbox/{id}/reject

Marks a pending draft as rejected. It will no longer appear in the
`pending` filter.

**Response:** The updated `InboxItemOut` object.

---

## The Refinery Worker

### `process_raw_capture_task(capture_id)`

Celery task. Runs asynchronously after `POST /ingest/raw`.

1. Fetches the `RawCapture` from the DB.
2. Calls `refine_content_with_llm(payload)` to extract structured drafts.
3. Inserts `InboxItem` rows (status=`pending`) for each draft.
4. Sets `raw_captures.processed_at = now()`.

### LLM Integration Stub

The function `refine_content_with_llm(payload)` in `worker/tasks.py` is
currently **stubbed** — it returns deterministic mock drafts so the entire
pipeline can be tested without burning LLM credits.

To activate real extraction:

1. Choose a provider and install the SDK:
   ```
   pip install google-generativeai   # Gemini 1.5 Flash
   # or
   pip install openai                # GPT-4o-mini
   ```

2. Add the API key to your `.env`:
   ```
   GEMINI_API_KEY=...
   # or
   OPENAI_API_KEY=...   (already used for embeddings)
   ```

3. Replace the stub body in `api/app/worker/tasks.py::refine_content_with_llm`
   with the real call. The function signature and return type must remain:
   ```python
   def refine_content_with_llm(payload: dict) -> list[dict]:
       # Returns: [{ type, title, content, confidence_score }, ...]
   ```

### Celery Beat: `retry_stale_raw_captures`

Runs hourly. Finds `raw_captures` with `processed_at IS NULL` older than
60 minutes and re-enqueues them. Handles worker crashes and cases where
`WORKER_ENABLED=false` was toggled on after captures were queued.

---

## TOON — Token-Oriented Object Notation

### Motivation

The standard `text` format of the Memory Pack is optimised for humans:
section headers, blank lines between types, and rich prose. For AI agents
calling the Recall API in a pipeline, this verbosity wastes tokens.

TOON strips the format to the minimum needed for an agent to consume the data.

### Format Specification

```
Memories[{count}] { type, content }:
{type}\t{content}
{type}\t{content}
```

- The header line declares the count and schema.
- Each subsequent line is `{type}\t{content}` (tab-separated).
- Content is compressed: multiple newlines → single space.
- No section headers, no blank lines.

### Example

**Text format:**
```
PROJECT MEMORY PACK
Query: auth flow

DECISION:
- We use magic links, not passwords, to eliminate credential management.

TODO:
- Add OAuth (GitHub, Google) post-alpha.
```

**TOON format:**
```
Memories[2] { type, content }:
decision	We use magic links, not passwords, to eliminate credential management.
todo	Add OAuth (GitHub, Google) post-alpha.
```

Token savings: ~38 % for this example.

### Usage

Append `?format=toon` to any Recall call:

```bash
curl "https://api.thecontextcache.com/projects/42/recall?query=auth+flow&format=toon" \
  -H "x-api-key: $CC_API_KEY"
```

In the web UI, select the **TOON** toggle in the Recall tab before running recall.

### When to Use Each Format

| Scenario | Format |
|----------|--------|
| Pasting into ChatGPT / Claude manually | `text` |
| Agent pipeline, CI/CD script, MCP tool | `toon` |
| Sharing with teammates | `text` |
| Token budget is tight (long context) | `toon` |

---

## Frontend Inbox UI

The Inbox UI lives at `/app/projects/{id}/inbox`.

**Access:** Click the **📥 Inbox** button in the project header on the main `/app` page.

**Features:**
- **Draft Cards** showing type badge, confidence score, title, and content preview.
- **Approve** — promotes to memory immediately (runs full pipeline).
- **Edit** — opens a modal to adjust type, title, or content, then approves.
- **Reject** — dismisses the draft.
- **Status filter tabs** — view pending / approved / rejected / all items.
- **Inbox Zero state** — celebration when no pending drafts remain.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_ENABLED` | `false` | Must be `true` for Celery tasks to run |
| `GEMINI_API_KEY` | (unset) | Gemini API key for real LLM extraction |
| `OPENAI_API_KEY` | (unset) | OpenAI key (also used for embeddings) |

---

## Deployment Notes

1. The Refinery worker requires the `worker` Docker Compose profile:
   ```
   docker compose --profile worker up -d
   ```
2. Without `WORKER_ENABLED=true`, `POST /ingest/raw` still queues the task
   but it will not run. Captures can be retried later once the worker is enabled.
3. The `retry_stale_raw_captures` Beat task automatically handles this case.
