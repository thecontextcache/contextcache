# Integrations (MCP-style capture)

ContextCache supports a simple ingestion API for external tools:

- `POST /integrations/memories`
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
javascript:(async()=>{const api="https://api.thecontextcache.com/integrations/memories";const key=prompt("X-API-Key");const org=prompt("X-Org-Id");const project=prompt("Project ID");await fetch(api,{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":key,"X-Org-Id":org},body:JSON.stringify({project_id:Number(project),type:"web",source:"extension",title:document.title,content:`${document.title}\n${location.href}`,metadata:{url:location.href},tags:["bookmarklet"]})});alert("Saved to ContextCache");})();```
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

## Ollama integration env

```env
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CONTEXT_MODEL=llama3.1
```

Sensitive keys/URLs are read from env only and are never returned by API responses.

## CLI examples

```bash
# Upload via integration endpoint
python cli/cc.py integrations upload --project 1 --type note --text "Captured from CLI"

# Contextualize memory with Ollama worker
python cli/cc.py integrations contextualize --memory-id 42
```
