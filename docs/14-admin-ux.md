# Admin UX — API Keys, Organisations, Inbox

> **Added:** February 24, 2026  
> **Scope:** Solo-operator developer experience — all admin tasks available through the web UI, no `psql` or `curl` required.

---

## Overview

This release adds three self-service admin surfaces to the web application, reachable via a new persistent **sidebar navigation** on all `/app/*` pages:

| Page | URL | Purpose |
|---|---|---|
| Dashboard | `/app` | Projects, memories, recall |
| API Keys | `/app/api-keys` | Create, manage, and track API keys |
| Organisation | `/app/orgs` | Create, rename, switch, and delete workspaces |

The **Inbox** page (`/app/projects/{id}/inbox`) was also fully redesigned for readability.

---

## 1. Sidebar Navigation (`/app/layout.js`)

All pages under `/app` now share a persistent left sidebar (220px wide, sticky, full viewport height).

**What it shows:**

- **Workspace label** — the name of your current active organisation, read from `localStorage` and updated live whenever you switch orgs (via a custom `cc:org-changed` DOM event).
- **Navigation links** with active-state highlighting:
  - ⬡ Dashboard
  - 🔑 API Keys
  - 🏢 Organisation

**Implementation notes:**

- Uses Next.js App Router's `layout.js` convention so the sidebar renders once and persists across client navigations without unmounting.
- The sidebar is a pure CSS `position: sticky; height: 100vh` — no JavaScript scroll logic.
- The org name syncs without a page reload: any page that changes the active org dispatches `window.dispatchEvent(new Event("cc:org-changed"))`, and the sidebar listens with `window.addEventListener("cc:org-changed", handler)`.

---

## 2. API Key Management (`/app/api-keys`)

### Creating a Key

1. Enter a descriptive name (e.g. `"Chrome Extension"`, `"CI Pipeline"`, `"Cursor Agent"`).
2. Click **Generate Key**.
3. The full plaintext key appears **once** in a green banner — copy it immediately. It is never shown again.
4. Use the key as: `X-API-Key: cck_…` in any HTTP request.

### Key List

Each active key card shows:

| Field | Source |
|---|---|
| Name | Set at creation |
| Prefix | First 8 chars of the key (`cck_abc1••••…`) |
| Status | Active / Revoked pill |
| Created | `created_at` timestamp |
| **Last Used** | `last_used_at` — updated on every successful authenticated request |
| **Total Requests** | `use_count` — incremented by the auth middleware on every request |

The **Last Used** and **Total Requests** fields are live: every API call with that key updates them in the database. This lets you instantly see whether an extension, agent, or CI job is actually connecting.

### Revoking a Key

Click **Revoke** → confirm in the modal → the key is immediately invalidated. All future requests with that key return `401 Unauthorized`. Revoked keys are shown in a collapsed historical section.

### Key Activity Log

Below the active keys list, the **Key Activity Log** shows the last 50 `api_key.*` events from the organisation's audit trail:

- `api_key.create` — key created (with name and prefix)
- `api_key.revoke` — key revoked (with prefix)

Click **↻ Refresh** to reload both the key list and the activity log.

### Usage Guide

The bottom of the page contains ready-to-copy code snippets for `curl`, Python, and `.env` format — so you can put a newly created key to use immediately without leaving the page.

---

## 3. Organisation Management (`/app/orgs`)

### Creating an Organisation

Enter a name and click **Create**. The first organisation requires no existing auth (bootstrap mode); subsequent ones require `admin` role.

Each organisation is a fully isolated workspace:
- Its own projects, memories, and API keys.
- Its own members and audit log.
- Its own usage counters.

### Renaming

Click **Rename** next to any org — the name becomes an inline editable field (no modal). Type the new name and press **Save** (or press Enter). The sidebar workspace label updates immediately via the `cc:org-changed` event.

### Switching Active Workspace

If you have multiple organisations, click **Switch** to make a different one the active workspace. This updates `localStorage` and the sidebar. All subsequent API calls include the new `X-Org-Id` header.

### Deleting an Organisation

Click **Delete** → confirm in the danger modal. The server checks that **no projects exist** before proceeding. If any remain, it returns:

```
409 Conflict: Cannot delete organisation: N project(s) still exist.
Delete all projects first.
```

Go to the Dashboard, delete all projects for that org, then return to the Organisation page and try again.

!!! warning "Permanent"
    Deleting an org permanently removes all its API keys, memberships, and audit logs. There is no undo.

---

## 4. Backend Endpoints (Added)

### `PATCH /orgs/{org_id}`

Rename an organisation. Requires `admin` role.

**Request:**
```json
{ "name": "New Name" }
```

**Response:** Updated `OrgOut` object.

**Audit event:** `org.rename`

---

### `DELETE /orgs/{org_id}`

Delete an organisation. Requires `owner` role.

**Safety check:** Returns `409` if `COUNT(projects WHERE org_id = id) > 0`.

**Response:** `204 No Content`

**Audit event:** `org.delete`

---

## 5. API Key Usage Tracking (Database Changes)

Two columns were added to the `api_keys` table in migration `20260224_0014`:

| Column | Type | Description |
|---|---|---|
| `last_used_at` | `TIMESTAMPTZ NULL` | Set to `NOW()` on every successful key auth |
| `use_count` | `INTEGER NOT NULL DEFAULT 0` | Incremented atomically on every successful key auth |

The update happens in the FastAPI auth middleware (`api/app/main.py`), immediately after the key is validated and before the request is forwarded:

```python
await session.execute(
    sa_update(ApiKey)
    .where(ApiKey.id == api_key_row.id)
    .values(
        last_used_at=datetime.now(timezone.utc),
        use_count=ApiKey.use_count + 1,
    )
)
await session.commit()
```

This is wrapped in a `try/except` — a stats-write failure never blocks or errors the actual request.

---

## 6. Inbox Redesign

### What Changed

The inbox at `/app/projects/{id}/inbox` was rebuilt for legibility and speed of triage.

#### Content Visibility

Previously, long memory content was clipped with a CSS `mask-image` fade after 180px — the bottom of the content was invisible and unreadable. Now:

- Full content is always visible.
- Items longer than 300 characters have a **"▼ Show more / ▲ Show less"** toggle.

#### Confidence Indicator

The plain `72% confidence` text is replaced by a **progress bar** with colour coding:

| Confidence | Colour | Meaning |
|---|---|---|
| ≥ 80% | Green | High confidence — likely approve |
| ≥ 50% | Amber | Medium — worth reviewing |
| < 50% | Red | Low confidence — probably reject |

#### Type Colour Strip

A 3px coloured top border on each card uses the memory type's accent colour (the same palette as the main dashboard). This makes the type scannable at a glance without reading the badge.

#### Bulk Actions

Select multiple cards via checkboxes, then use the sticky **bulk action bar** that appears at the top:

- **✓ Approve all (N)** — approves all selected items sequentially.
- **✕ Reject all (N)** — rejects all selected items sequentially.
- **Clear** — deselects all.

A **Select all / Deselect all** shortcut appears in the filter bar when items are loaded.

#### Type Selector in Edit Modal

The edit modal's type selector changed from a plain `<select>` dropdown to visual **coloured pill buttons** — one per type. Clicking a pill immediately previews the colour that card will have after approval.

#### Filter Tabs

Status filter tabs (`Pending / Approved / Rejected / All`) are now pill-style rounded buttons with a violet fill on the active state — consistent with the rest of the app's button design.

#### Empty States

The empty state is now context-aware:

- **Pending (empty):** "No pending drafts. Send some data via `POST /ingest/raw` to get started."
- **Approved/Rejected/All (empty):** "No {filter} items. Switch to a different filter."

---

## 7. Common Operations Quick Reference

### Create an API key via UI (no `psql` required)

1. Go to `/app/api-keys`.
2. Type a name → **Generate Key**.
3. Copy the key from the green banner.
4. Add to your server: `CC_API_KEY=cck_…` in `.env`.

### Create an API key via `curl` (server-side)

```bash
# First, find your org ID
curl -s http://localhost:8000/me/orgs \
  -H "X-API-Key: YOUR_EXISTING_KEY" | python3 -m json.tool

# Then create a key
curl -s -X POST "http://localhost:8000/orgs/{ORG_ID}/api-keys" \
  -H "X-API-Key: YOUR_EXISTING_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Key"}' | python3 -m json.tool
```

### Rename an organisation via `curl`

```bash
curl -s -X PATCH "http://localhost:8000/orgs/{ORG_ID}" \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Org Name"}'
```

### Delete an organisation via `curl`

```bash
# This will 409 if projects exist
curl -s -X DELETE "http://localhost:8000/orgs/{ORG_ID}" \
  -H "X-API-Key: YOUR_KEY"
```

### Ingest raw content and review in Inbox

```bash
curl -X POST "http://localhost:8000/ingest/raw" \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "cli",
    "project_id": YOUR_PROJECT_ID,
    "payload": { "text": "DECISION: We will use Postgres for all structured storage." }
  }'
# Returns: { "status": "queued", "capture_id": N }
# Then visit /app/projects/{id}/inbox to approve the AI-extracted draft
```
