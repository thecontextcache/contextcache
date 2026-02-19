"""HTTP stub for ANALYZER_MODE=service.

When ANALYZER_MODE=service the API calls an internal analyzer container
(e.g. http://analyzer:9000) instead of using in-process logic.

The analyzer service is:
  - Reachable ONLY on the Docker internal network (no public port).
  - Never accessible via Cloudflare Tunnel or any public route.
  - Enabled by running: docker compose --profile analyzer up

This file is a STUB.  Flesh it out when the analyzer service is built.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

_ANALYZER_URL = os.getenv("ANALYZER_SERVICE_URL", "http://analyzer:9000").rstrip("/")
_TIMEOUT = float(os.getenv("ANALYZER_TIMEOUT_SECONDS", "10"))


async def score_memories_remote(
    query: str,
    memories: list[dict[str, Any]],
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Call the internal analyzer service for scoring.

    Raises httpx.HTTPError on failure; callers should fall back to local
    scoring or surface a 503 to the client.

    IMPORTANT: do not include tokens, secrets, or session cookies in the
    payload — pass only project domain data.
    """
    payload = {"query": query, "memories": memories, "limit": limit}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(f"{_ANALYZER_URL}/score", json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data.get("items", [])
