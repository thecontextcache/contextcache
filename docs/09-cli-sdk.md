# CLI & Python SDK

thecontextcache™ ships a zero-dependency CLI and a Python SDK for scripting and
integration work.

---

## CLI (`cc`)

### Installation

```bash
# Clone or copy cli/cc.py to your PATH
cp cli/cc.py /usr/local/bin/cc
chmod +x /usr/local/bin/cc

# Or use an alias:
alias cc="python3 /path/to/contextcache/cli/cc.py"
```

Requires **Python 3.9+** — no external packages needed.

### Authentication

```bash
cc login --api-key cck_your_key_here
# Optional: specify a custom API URL or org
cc login --api-key cck_xxx --base-url https://api.thecontextcache.com --org-id 1

# Any command can override runtime config:
cc projects list --api-base https://api.thecontextcache.com --api-key cck_xxx --org-id 1
```

The API key and base URL are stored in `~/.contextcache/config.json` (mode 0600).

### Commands

#### Health check

```bash
cc health
# → ✓ API is healthy: {'status': 'ok', ...}
```

#### Projects

```bash
cc projects list
cc projects create "Sprint Planning Q1 2026"
```

#### Memories

```bash
# Add a memory from text
cc mem add --project 1 --type decision --text "We use Postgres, not MySQL."

# Add a memory from a file
cc mem add --project 1 --type doc --file ./ADR-001.md --title "ADR-001: Database"

# List memories in a project
cc mem list --project 1
```

**Supported types:** `decision`, `finding`, `definition`, `note`, `link`, `todo`, `chat`, `doc`, `code`

#### Recall

```bash
cc recall --project 1 "postgres schema decisions"
cc recall --project 1 --limit 5 "authentication flow"
```

The output shows a ranked list and the full memory pack text.

#### Usage

```bash
cc usage
# Usage for 2026-02-19
#   Memories created : 4 / 100
#   Recall queries   : 2 / 50
#   Projects created : 1 / 10
```

#### Invites (admin)

```bash
cc invites list --status pending --email-q user --limit 20 --offset 0
cc invites create user@example.com
cc invites create user@example.com --notes "Beta tester from Bluesky"
cc invites revoke 42
```

#### Waitlist (admin)

```bash
cc waitlist list --status pending --email-q gmail --limit 20 --offset 0
cc waitlist approve 7      # converts waitlist entry → active invite
cc waitlist reject 7
```

#### Integrations + Admin helpers

```bash
cc integrations upload --project 1 --type note --text "Captured from CLI"
cc integrations upload --project 1 --type doc --file ./notes.md
cc integrations list --project 1 --limit 20 --offset 0
cc integrations contextualize --memory-id 42
cc seed-mock-data --num-projects 5 --memories-per-project 8

cc admin users --status active --limit 20 --offset 0
cc admin set-unlimited 5 --value true
cc admin login-events 5
cc admin stats 5
cc admin recall-logs --project 1 --limit 20 --offset 0
cc admin cag-stats
cc admin cag-evaporate
```

`cc seed-mock-data` uses the SDK and uploads memories through
`POST /integrations/memories` (HTTP), so audit/rate-limit/lineage paths stay identical to normal ingestion.
It supports:
- `--num-projects N` (default: `3`)
- `--memories-per-project N` (default: `2`)

---

## Python SDK (`cli/sdk.py`)

The SDK is a thin synchronous wrapper with no external dependencies.

### Installation

```python
# Add cli/ to your Python path
import sys
sys.path.insert(0, "/path/to/contextcache")
from cli.sdk import ContextCacheClient
```

### Quickstart

```python
from cli.sdk import ContextCacheClient, ContextCacheError

client = ContextCacheClient(
    api_key="cck_your_key_here",
    base_url="https://api.thecontextcache.com",
    org_id=1,
)

# Optional version hint header
client = ContextCacheClient(
    api_key="cck_your_key_here",
    base_url="https://api.thecontextcache.com",
    org_id=1,
    api_version="2026-02-beta",
)

# Health check
print(client.health())

# Projects
projects = client.projects.list()
project  = client.projects.create("My Sprint Notes")
print(project["id"], project["name"])

# Add memories
mem = client.memories.add(
    project_id=project["id"],
    type="decision",
    content="We use PostgreSQL 16 with FTS for memory recall.",
    title="DB decision",
    tags=["infra", "db"],
)
print(mem["id"])

# List memories
mems = client.memories.list(project_id=project["id"])
for m in mems:
    print(m["type"], m["title"])

# Recall
results = client.recall(project_id=project["id"], query="database postgres")
for item in results["items"]:
    print(f"[{item['type']}] {item.get('title') or item['content'][:60]}")
print(results["memory_pack_text"])

# Usage
usage = client.usage()
lim   = usage["limits"]
print(f"Memories: {usage['memories_created']} / {lim['memories_per_day']}")
```

### Admin operations (admin API key required)

```python
# Invites
invite = client.invites.create("newuser@example.com", notes="From blog post")
client.invites.revoke(invite["id"])
all_invites = client.invites.list()

# Waitlist
entries = client.waitlist.list()
invite  = client.waitlist.approve(entries[0]["id"])
client.waitlist.reject(entries[1]["id"])

# Integrations
client.integrations.upload_memory(
    project_id=1,
    type="note",
    content="Captured from SDK",
    tags=["sdk"],
)
client.integrations.list_memories(project_id=1, limit=20, offset=0)
client.integrations.contextualize_memory(42)

# Admin namespace
users = client.admin.users.list(page=1, limit=20, is_admin=True)
client.admin.users.set_unlimited(users[0]["id"], unlimited=True)
events = client.admin.users.login_events(users[0]["id"])
stats = client.admin.users.stats(users[0]["id"])
recall_logs = client.admin.recall_logs(limit=20, offset=0, project_id=1)
cache_stats = client.admin.cag_cache_stats()
client.admin.evaporate_cag_cache()

# Public waitlist join (no auth required)
public = ContextCacheClient(api_key="", base_url="https://api.thecontextcache.com")
public.waitlist.join("user@example.com", source="sdk")
```

### Error handling

```python
from cli.sdk import ContextCacheError

try:
    client.memories.add(project_id=999, type="note", content="test")
except ContextCacheError as e:
    print(e.status, e.detail)   # e.g. 404, "Project not found"
```

### Raw requests (escape hatch)

```python
# Call any API path directly
result = client.request("GET", "/admin/users/1/stats")
```

---

## Environment variables for CI/CD

```bash
export CC_API_KEY=cck_xxx
export CC_BASE_URL=https://api.thecontextcache.com
export CC_ORG_ID=1
```

Aliases also supported by the CLI for shell compatibility:

```bash
export API_KEY=cck_xxx
export ORG_ID=1
```

When `CC_API_KEY` / `CC_BASE_URL` / `CC_ORG_ID` (or `API_KEY` / `ORG_ID`) are set, both the CLI and SDK
will use them without a saved config file. *(SDK: pass as constructor args;
CLI: `--api-key` / `--base-url` / `--org-id` flags override any saved config.)*
