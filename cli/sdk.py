"""
ContextCache Python SDK

A thin synchronous wrapper around the ContextCache REST API.
Zero external dependencies — uses only Python 3.9+ stdlib.

Quickstart::

    from cli.sdk import ContextCacheClient

    client = ContextCacheClient(
        api_key="cck_your_key_here",
        base_url="https://api.thecontextcache.com",
        org_id=1,
    )

    projects = client.projects.list()
    project  = client.projects.create("Sprint planning notes")

    memory = client.memories.add(
        project_id=project["id"],
        type="decision",
        content="We store all state in Postgres, no Redis for alpha.",
    )

    results = client.recall(project_id=project["id"], query="postgres decision")
    print(results["memory_pack_text"])

    usage = client.usage()
    print(usage["memories_created"], "/", usage["limits"]["memories_per_day"])
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

__version__ = "0.2.0"

__all__ = ["ContextCacheClient", "ContextCacheError", "__version__"]


class ContextCacheError(Exception):
    """Raised on non-2xx API responses."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


# ---------------------------------------------------------------------------
# Core HTTP transport
# ---------------------------------------------------------------------------


class _Transport:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        org_id: int | None,
        timeout: int,
        api_version: str | None = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._key = api_key
        self._org_id = str(org_id) if org_id is not None else None
        self._timeout = timeout
        self._api_version = (api_version or "").strip() or None

    def request(
        self,
        method: str,
        path: str,
        *,
        body: dict | None = None,
        params: dict | None = None,
    ) -> Any:
        url = self._base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)

        headers: dict[str, str] = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._key:
            headers["X-API-Key"] = self._key
        if self._org_id:
            headers["X-Org-Id"] = self._org_id
        if self._api_version:
            headers["X-API-Version"] = self._api_version

        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                detail = json.loads(raw).get("detail", raw.decode(errors="replace"))
            except Exception:
                detail = str(exc)
            raise ContextCacheError(exc.code, detail) from exc
        except urllib.error.URLError as exc:
            raise ContextCacheError(0, f"Connection failed: {exc.reason}") from exc


# ---------------------------------------------------------------------------
# Resource namespaces
# ---------------------------------------------------------------------------


class _Projects:
    def __init__(self, t: _Transport) -> None:
        self._t = t

    def list(self) -> list[dict]:
        """Return all projects for the configured org."""
        return self._t.request("GET", "/projects")

    def create(self, name: str) -> dict:
        """Create a new project and return it."""
        return self._t.request("POST", "/projects", body={"name": name})

    def get(self, project_id: int) -> dict:
        return self._t.request("GET", f"/projects/{project_id}")

    def delete(self, project_id: int) -> dict:
        return self._t.request("DELETE", f"/projects/{project_id}")


class _Memories:
    def __init__(self, t: _Transport) -> None:
        self._t = t

    def list(self, project_id: int) -> list[dict]:
        """Return all memories for a project."""
        return self._t.request("GET", f"/projects/{project_id}/memories")

    def add(
        self,
        project_id: int,
        content: str,
        *,
        type: str = "note",
        title: str | None = None,
        source: str = "sdk",
        tags: list[str] | None = None,
    ) -> dict:
        """Create a new memory and return it."""
        body: dict = {"type": type, "content": content, "source": source}
        if title:
            body["title"] = title
        if tags:
            body["tags"] = tags
        return self._t.request("POST", f"/projects/{project_id}/memories", body=body)

    def get(self, project_id: int, memory_id: int) -> dict:
        return self._t.request("GET", f"/projects/{project_id}/memories/{memory_id}")

    def delete(self, project_id: int, memory_id: int) -> dict:
        return self._t.request("DELETE", f"/projects/{project_id}/memories/{memory_id}")


class _Invites:
    def __init__(self, t: _Transport) -> None:
        self._t = t

    def list(self, *, limit: int | None = None, offset: int | None = None, status: str | None = None, email_q: str | None = None) -> list[dict]:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        if status:
            params["status"] = status
        if email_q:
            params["email_q"] = email_q
        return self._t.request("GET", "/admin/invites", params=params or None)

    def create(self, email: str, notes: str | None = None) -> dict:
        body: dict = {"email": email}
        if notes:
            body["notes"] = notes
        return self._t.request("POST", "/admin/invites", body=body)

    def revoke(self, invite_id: int) -> dict:
        return self._t.request("POST", f"/admin/invites/{invite_id}/revoke")


class _Waitlist:
    def __init__(self, t: _Transport) -> None:
        self._t = t

    def list(self, *, limit: int | None = None, offset: int | None = None, status: str | None = None, email_q: str | None = None) -> list[dict]:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        if status:
            params["status"] = status
        if email_q:
            params["email_q"] = email_q
        return self._t.request("GET", "/admin/waitlist", params=params or None)

    def join(self, email: str, source: str | None = None) -> dict:
        """Public — join the waitlist."""
        body: dict = {"email": email}
        if source:
            body["source"] = source
        return self._t.request("POST", "/waitlist", body=body)

    def approve(self, entry_id: int) -> dict:
        return self._t.request("POST", f"/admin/waitlist/{entry_id}/approve")

    def reject(self, entry_id: int) -> dict:
        return self._t.request("POST", f"/admin/waitlist/{entry_id}/reject")


class _Integrations:
    def __init__(self, t: _Transport) -> None:
        self._t = t

    def upload_memory(
        self,
        *,
        project_id: int,
        type: str,
        content: str,
        source: str = "sdk",
        title: str | None = None,
        metadata: dict[str, Any] | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        body: dict[str, Any] = {
            "project_id": project_id,
            "type": type,
            "source": source,
            "content": content,
            "metadata": metadata or {},
            "tags": tags or [],
        }
        if title:
            body["title"] = title
        return self._t.request("POST", "/integrations/memories", body=body)

    def contextualize_memory(self, memory_id: int) -> dict:
        """Queue contextualization for an existing memory."""
        return self._t.request("POST", f"/integrations/memories/{memory_id}/contextualize")

    def list_memories(
        self,
        *,
        project_id: int | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict]:
        """List memories from integration API surface."""
        params: dict[str, Any] = {}
        if project_id is not None:
            params["project_id"] = project_id
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return self._t.request("GET", "/integrations/memories", params=params or None)


class _AdminUsers:
    def __init__(self, t: _Transport) -> None:
        self._t = t

    def list(
        self,
        *,
        page: int = 1,
        limit: int = 20,
        email_q: str | None = None,
        status: str | None = None,
        is_admin: bool | None = None,
    ) -> list[dict]:
        params: dict[str, Any] = {"limit": limit, "offset": max(0, (page - 1) * limit)}
        if email_q:
            params["email_q"] = email_q
        if status:
            params["status"] = status
        if is_admin is not None:
            params["is_admin"] = str(is_admin).lower()
        return self._t.request("GET", "/admin/users", params=params)

    def set_unlimited(self, user_id: int, *, unlimited: bool = True) -> dict:
        return self._t.request(
            "POST",
            f"/admin/users/{user_id}/set-unlimited",
            params={"unlimited": str(unlimited).lower()},
        )

    def login_events(self, user_id: int) -> list[dict]:
        return self._t.request("GET", f"/admin/users/{user_id}/login-events")

    def stats(self, user_id: int) -> dict:
        return self._t.request("GET", f"/admin/users/{user_id}/stats")


class _Admin:
    def __init__(self, t: _Transport) -> None:
        self.users = _AdminUsers(t)
        self.invites = _Invites(t)
        self.waitlist = _Waitlist(t)
        self.projects = _Projects(t)


# ---------------------------------------------------------------------------
# Main client
# ---------------------------------------------------------------------------


class ContextCacheClient:
    """Synchronous client for the ContextCache API.

    Args:
        api_key:  Your API key (starts with ``cck_``).
        base_url: Base URL of the API (default: https://api.thecontextcache.com).
        org_id:   Organisation ID sent as ``X-Org-Id`` header.
        timeout:  Request timeout in seconds (default: 15).
        api_version: Optional API version header value sent as ``X-API-Version``.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.thecontextcache.com",
        org_id: int | None = None,
        timeout: int = 15,
        api_version: str | None = None,
    ) -> None:
        self._t = _Transport(
            base_url=base_url,
            api_key=api_key,
            org_id=org_id,
            timeout=timeout,
            api_version=api_version,
        )
        self.projects = _Projects(self._t)
        self.memories = _Memories(self._t)
        self.invites  = _Invites(self._t)
        self.waitlist = _Waitlist(self._t)
        self.integrations = _Integrations(self._t)
        self.admin = _Admin(self._t)

    # Convenience top-level methods
    def health(self) -> dict:
        """Check API health."""
        return self._t.request("GET", "/health")

    def recall(self, project_id: int, query: str, *, limit: int = 10) -> dict:
        """Run a recall query against a project."""
        return self._t.request(
            "GET",
            f"/projects/{project_id}/recall",
            params={"query": query, "limit": limit},
        )

    def usage(self) -> dict:
        """Return today's usage counters and configured limits for the current user."""
        return self._t.request("GET", "/me/usage")

    # Pass-through for raw requests (escape hatch)
    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        """Make a raw authenticated request to any API path."""
        return self._t.request(method, path, **kwargs)
