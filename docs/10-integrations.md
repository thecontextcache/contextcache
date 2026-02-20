# Integrations (MCP-style capture)

ContextCache supports a simple ingestion API for external tools:

- `POST /integrations/memories`
- `GET /integrations/memories`
- `POST /projects/{project_id}/memories` (equivalent direct route)

Both routes enforce the same auth, RBAC, and usage limits.

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
2. **RAG fallback**: if CAG confidence is low, run hybrid retrieval over project memories:
   - PostgreSQL FTS (`websearch_to_tsquery`)
   - pgvector cosine similarity
   - recency boost

This means global/product answers can return instantly, while project-specific queries still use memory retrieval.

### CAG environment

```env
CAG_ENABLED=true
CAG_MAX_TOKENS=180000
CAG_MATCH_THRESHOLD=0.58
CAG_SOURCE_FILES=docs/00-overview.md,docs/01-mvp-scope.md,docs/04-api-contract.md,docs/legal.md
```

## CocoIndex ingestion baseline

The backend now includes `api/app/ingestion/` with:

- `cocoindex_flow.py` (flow definition scaffolding)
- `pipeline.py` incremental file ingestion

`ingest_path_incremental` stores metadata per chunk:

- `source_filename`
- `source_last_modified`
- `ingestion_chunk_index`

and writes embeddings to `memories.embedding_vector` / `memories.search_vector`.

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
```
