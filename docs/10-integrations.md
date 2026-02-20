# Integrations (MCP-style capture)

ContextCache supports a simple ingestion API for external tools:

- `POST /integrations/memories`
- `GET /integrations/memories`
- `POST /projects/{project_id}/memories` (equivalent direct route)

Both routes enforce the same auth, RBAC, and usage limits.

## External LLM Capture Architecture

Integrating with external LLM tools requires specific architectural patterns due to security and environment constraints. The core web application cannot "reach into" other websites (like ChatGPT) due to browser CORS policies.

### 1. Web-based LLMs (ChatGPT, Claude, Gemini)
To automatically capture chats from browser-based LLMs, you must build a **Browser Extension**.
- **Mechanism:** The extension injects a content script into the LLM's page scope.
- **Action:** It observes the DOM (e.g., using `MutationObserver` on chat message lists) or intercepts network requests.
- **Ingestion:** When a significant answer is generated, the extension formats the payload and sends a `POST` request to `https://api.thecontextcache.com/integrations/memories`.
- **Auth:** The extension should allow the user to input their `CONTEXTCACHE_API_KEY` and `CONTEXTCACHE_ORG_ID` in its options page.

### 2. Programmatic LLMs (LangChain, Ollama, CLI tools)
To capture programmatic LLM generations, you must build an **SDK Proxy Middleware** or use lifecycle hooks.
- **Mechanism:** Create a wrapper around the LLM generation call.
- **Action:** Instead of just calling `llm.generate(prompt)`, call a wrapped function that first hits the LLM, then asynchronously sends the prompt/response pair to ContextCache.
- **Ingestion:** Emit a `POST` to `/integrations/memories` using the environment's stored API keys.
- **Auth:** Read `CONTEXTCACHE_API_KEY` directly from the environment variables.

## Auth

Use either:

- Session cookie (`/auth/verify` login flow)
- API key header: `X-API-Key: <key>` (+ `X-Org-Id` when needed)

## Request shape

```json
{
  "project_id": 1,
  "type": "note",
  "source": "extension",
  "title": "Optional title",
  "content": "Captured memory text",
  "metadata": {"url": "https://example.com"},
  "tags": ["capture", "browser"]
}
```

Optional request signing:

- Header: `X-Integration-Signature: sha256=<hmac>`
- HMAC input: raw HTTP body bytes
- Secret source: `INTEGRATION_SIGNING_SECRET`
- When secret is unset, signature enforcement is disabled.

## VS Code save hook (minimal example)

```js
import * as vscode from "vscode";

async function pushMemory(projectId, text) {
  await fetch("https://api.thecontextcache.com/integrations/memories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.CONTEXTCACHE_API_KEY,
      "X-Org-Id": process.env.CONTEXTCACHE_ORG_ID,
    },
    body: JSON.stringify({
      project_id: Number(projectId),
      type: "code",
      source: "extension",
      content: text,
      metadata: { tool: "vscode", event: "onSave" },
      tags: ["autosave"],
    }),
  });
}
```

## Browser bookmarklet (save current page)

```js
javascript:(async()=>{const api="https://api.thecontextcache.com/integrations/memories";const key=prompt("X-API-Key");const org=prompt("X-Org-Id");const project=prompt("Project ID");if(!key||!project){alert("Missing key or project");return;}await fetch(api,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":key,"X-Org-Id":org||""},body:JSON.stringify({project_id:Number(project),type:"web",source:"extension",title:document.title,content:document.title+"\\n"+location.href,metadata:{url:location.href},tags:["bookmarklet"]})});alert("Saved to ContextCache");})(); 
```

## Dummy Slack bot handler (Python)

```python
def handle_slack_message(text: str, project_id: int, api_key: str, org_id: int) -> None:
    import requests
    requests.post(
        "https://api.thecontextcache.com/integrations/memories",
        headers={"X-API-Key": api_key, "X-Org-Id": str(org_id)},
        json={
            "project_id": project_id,
            "type": "chat",
            "source": "api",
            "content": text,
            "metadata": {"tool": "slack-bot"},
            "tags": ["slack"],
        },
        timeout=10,
    ).raise_for_status()
```

## Notes

- For public beta scale, this API is enough for IDE plugins, bots, and scripts.
- Future hardening: signed webhooks, per-integration keys, and Redis-backed global rate limits.

## CAG + RAG retrieval flow

Recall uses a two-stage decision:

1. **CAG pre-check**: query is matched against a static golden-knowledge cache (docs + built-ins) preloaded in memory.
   - CAG scoring uses in-memory embedding similarity (`CAG_EMBEDDING_MODEL_NAME`).
   - Default provider is deterministic hash embeddings for speed/stability; optional sentence-transformers can be enabled.
2. **RAG fallback**: if CAG confidence is low, run hybrid retrieval over project memories:
   - PostgreSQL FTS (`websearch_to_tsquery`)
   - Hilbert prefilter (`hilbert_index` range) + pgvector cosine similarity
   - recency boost

This means global/product answers can return instantly, while project-specific queries still use memory retrieval.

### CAG environment

```env
CAG_ENABLED=true
CAG_MODE=local
CAG_MAX_TOKENS=180000
CAG_MATCH_THRESHOLD=0.58
CAG_EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
CAG_EMBEDDING_PROVIDER=hash
CAG_EMBEDDING_DIMS=384
CAG_CACHE_MAX_ITEMS=512
CAG_PHEROMONE_HIT_BOOST=0.15
CAG_PHEROMONE_EVAPORATION=0.95
CAG_EVAPORATION_INTERVAL_SECONDS=600
CAG_KV_STUB_ENABLED=true
CAG_SOURCE_FILES=docs/00-overview.md,docs/01-mvp-scope.md,docs/04-api-contract.md,docs/legal.md
```

Phase 3 cache behavior:
- CAG entries reinforce `pheromone_level` on hits.
- A background evaporation loop decays pheromone every 10 minutes.
- Eviction removes the lowest pheromone entries, then least-recently-accessed ties.

## CocoIndex ingestion baseline

The backend now includes `api/app/ingestion/` with:

- `cocoindex_flow.py` (flow definition scaffolding)
- `pipeline.py` incremental file ingestion

`ingest_path_incremental` stores metadata per chunk:

- `source_filename`
- `source_last_modified`
- `ingestion_chunk_index`

and writes embeddings to `memories.embedding_vector` / `memories.search_vector`.

Hashing + reprocessing rules:
- chunk hash is based on `project_id + chunk_content` (not file mtime)
- file `mtime` is used only to decide whether the file needs re-checking
- if content is unchanged but mtime changes, chunks are rechecked but not re-embedded

## Ollama integration env

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CONTEXT_MODEL=llama3.1
OLLAMA_EMBED_ENDPOINT=http://ollama:11434/api/embeddings
OLLAMA_CHAT_ENDPOINT=http://ollama:11434/api/generate
ANALYZER_MODE=ollama
```

Sensitive keys/URLs are read from env only and are never returned by API responses.

## CLI examples

```bash
# Upload via integration endpoint
python cli/cc.py integrations upload --project 1 --type note --text "Captured from CLI"

# Upload from file
python cli/cc.py integrations upload --project 1 --type doc --file ./notes.md

# List integration memories
python cli/cc.py integrations list --project 1 --limit 20 --offset 0

# Contextualize memory with Ollama worker
python cli/cc.py integrations contextualize --memory-id 42

# Seed demo projects/memories via HTTP integration API (uses SDK)
python cli/cc.py seed-mock-data --num-projects 5 --memories-per-project 8
```

Seed flags:
- `--num-projects` (default `3`)
- `--memories-per-project` (default `2`)

## SQLAlchemy seed utility

For direct DB-side seeding (admin/demo setup), use:

```bash
docker compose exec api uv run python -m app.seed_mock_data

# Host wrapper (only when DATABASE_URL is reachable from host)
python scripts/seed_mock_data.py
```

This script:
- ensures `dn@thecontextcache.com` exists and is admin (target auth user id `2`)
- ensures a demo org + ownership membership
- creates mock projects (`Alpha Launch`, `Q2 Planning`, `Research Roadmap`)
- creates typed memories with metadata/tags over multiple dates
- writes `memory_embeddings` rows and vector fields via SQLAlchemy
