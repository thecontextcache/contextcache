#!/usr/bin/env python3
"""
cc — ContextCache CLI v0

A lightweight command-line client for the ContextCache API.

Auth: API key stored in ~/.contextcache/config.json after `cc login`.
      Never stores magic links, session tokens, or passwords.

Usage:
    cc login --api-key cck_xxx [--base-url https://api.thecontextcache.com] [--org-id 1]
    cc health
    cc projects list
    cc projects create "My Project"
    cc mem add --project 1 --type decision --text "We use Postgres for persistence"
    cc mem add --project 1 --type note --file ./notes.txt
    cc mem list --project 1
    cc recall --project 1 "postgres schema decisions"
    cc usage
    cc invites list
    cc invites create user@example.com [--notes "Beta tester"]
    cc invites revoke INVITE_ID
    cc waitlist list
    cc waitlist approve ENTRY_ID
    cc waitlist reject ENTRY_ID
    cc integrations upload --project 1 --type note --text "hello"
    cc integrations list --project 1 --limit 20 --offset 0
    cc integrations contextualize --memory-id 42
    cc seed-mock-data [--num-projects 3] [--memories-per-project 2]
    cc admin users [--limit 20 --offset 0 --email-q foo --status active]
    cc admin set-unlimited USER_ID [--value true|false]
    cc admin login-events USER_ID

Global flags (work with any command):
    --api-base URL
    --api-key KEY
    --org-id N
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass  # stdlib — always available

# ── Config persistence ─────────────────────────────────────────────────────

CONFIG_DIR  = Path(os.getenv("CC_CONFIG_DIR", Path.home() / ".contextcache"))
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_BASE_URL = "https://api.thecontextcache.com"
_GLOBAL_OVERRIDES: dict[str, str] = {}


def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    # Write with restricted permissions — no world read
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    CONFIG_FILE.chmod(0o600)


# ── HTTP helpers ──────────────────────────────────────────────────────────

def _request(
    method: str,
    path: str,
    *,
    body: dict | None = None,
    cfg: dict | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    org_id: int | str | None = None,
) -> Any:
    """Make an authenticated request to the API and return the parsed JSON body."""
    cfg = cfg or _load_config()
    env_base = os.getenv("CC_BASE_URL") or os.getenv("CONTEXTCACHE_API_BASE_URL")
    env_key = os.getenv("CC_API_KEY") or os.getenv("API_KEY")
    env_org = os.getenv("CC_ORG_ID") or os.getenv("ORG_ID")
    resolved_base = (
        base_url
        or _GLOBAL_OVERRIDES.get("base_url")
        or env_base
        or cfg.get("base_url", DEFAULT_BASE_URL)
    )
    resolved_key = api_key or _GLOBAL_OVERRIDES.get("api_key") or env_key or cfg.get("api_key", "")
    resolved_org = org_id or _GLOBAL_OVERRIDES.get("org_id") or env_org or cfg.get("org_id") or ""

    url = resolved_base.rstrip("/") + path
    key = str(resolved_key or "")
    oid = str(resolved_org)

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if key:
        headers["X-API-Key"] = key
    if oid:
        headers["X-Org-Id"] = oid

    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            detail = json.loads(raw).get("detail", raw.decode())
        except Exception:
            detail = str(exc)
        _err(f"HTTP {exc.code}: {detail}")
    except urllib.error.URLError as exc:
        _err(f"Connection failed: {exc.reason}. Is the API reachable?")


def _resolved_runtime_auth(cfg: dict | None = None) -> tuple[str, str, str]:
    cfg = cfg or _load_config()
    env_base = os.getenv("CC_BASE_URL") or os.getenv("CONTEXTCACHE_API_BASE_URL")
    env_key = os.getenv("CC_API_KEY") or os.getenv("API_KEY")
    env_org = os.getenv("CC_ORG_ID") or os.getenv("ORG_ID")
    base_url = (_GLOBAL_OVERRIDES.get("base_url") or env_base or cfg.get("base_url") or DEFAULT_BASE_URL).rstrip("/")
    api_key = str(_GLOBAL_OVERRIDES.get("api_key") or env_key or cfg.get("api_key") or "")
    org_id = str(_GLOBAL_OVERRIDES.get("org_id") or env_org or cfg.get("org_id") or "")
    return base_url, api_key, org_id


def _err(msg: str) -> None:
    print(f"\033[31mError:\033[0m {msg}", file=sys.stderr)
    sys.exit(1)


def _ok(msg: str) -> None:
    print(f"\033[32m✓\033[0m {msg}")


def _print_table(rows: list[dict], keys: list[str]) -> None:
    if not rows:
        print("(no results)")
        return
    widths = {k: max(len(k), max(len(str(r.get(k, ""))) for r in rows)) for k in keys}
    header = "  ".join(k.ljust(widths[k]) for k in keys)
    sep    = "  ".join("-" * widths[k] for k in keys)
    print(header)
    print(sep)
    for r in rows:
        print("  ".join(str(r.get(k, "")).ljust(widths[k]) for k in keys))


# ── CLI commands ─────────────────────────────────────────────────────────────

def cmd_help(_args: list[str]) -> None:
    print(__doc__)


def cmd_login(args: list[str]) -> None:
    """cc login --api-key KEY [--base-url URL] [--org-id N]"""
    api_key  = _flag(args, "--api-key") or _GLOBAL_OVERRIDES.get("api_key")
    base_url = _flag(args, "--base-url") or _GLOBAL_OVERRIDES.get("base_url") or DEFAULT_BASE_URL
    org_id   = _flag(args, "--org-id") or _GLOBAL_OVERRIDES.get("org_id")

    if not api_key:
        _err("--api-key is required.  Example: cc login --api-key cck_xxxxx")

    # Verify the key works
    result = _request("GET", "/health", base_url=base_url, api_key=api_key)
    if not result or result.get("status") != "ok":
        _err("Could not verify API key against /health.  Check the key and base URL.")

    cfg: dict = {"api_key": api_key, "base_url": base_url.rstrip("/")}
    if org_id:
        cfg["org_id"] = int(org_id)
    _save_config(cfg)
    _ok(f"Logged in. Config saved to {CONFIG_FILE}")
    print(f"   base_url: {cfg['base_url']}")
    if org_id:
        print(f"   org_id:   {org_id}")


def cmd_health(_args: list[str]) -> None:
    """cc health"""
    cfg = _load_config()
    result = _request("GET", "/health", cfg=cfg)
    _ok(f"API is healthy: {result}")


def cmd_projects(args: list[str]) -> None:
    """cc projects list | cc projects create NAME"""
    sub = args[0] if args else ""
    if sub == "list":
        rows = _request("GET", "/projects") or []
        _print_table(rows, ["id", "name", "created_at"])
    elif sub == "create":
        name = " ".join(args[1:]).strip()
        if not name:
            _err("Provide a project name: cc projects create \"My Project\"")
        result = _request("POST", "/projects", body={"name": name})
        _ok(f"Project created — id={result['id']}  name={result['name']}")
    else:
        print("Usage: cc projects [list | create NAME]")


def cmd_mem(args: list[str]) -> None:
    """cc mem add --project ID --type TYPE --text TEXT [--title TITLE] [--file PATH]
       cc mem list --project ID"""
    sub = args[0] if args else ""
    if sub == "add":
        project_id = _flag(args, "--project")
        mem_type   = _flag(args, "--type") or "note"
        text_val   = _flag(args, "--text")
        file_path  = _flag(args, "--file")
        title      = _flag(args, "--title")
        source     = _flag(args, "--source") or "api"

        if not project_id:
            _err("--project is required")

        if file_path:
            try:
                text_val = Path(file_path).read_text(encoding="utf-8")
            except OSError as exc:
                _err(f"Cannot read file {file_path}: {exc}")
        if not text_val:
            _err("Provide content via --text TEXT or --file PATH")

        body: dict = {
            "type": mem_type,
            "source": source,
            "content": text_val,
        }
        if title:
            body["title"] = title

        result = _request("POST", f"/projects/{project_id}/memories", body=body)
        _ok(f"Memory saved — id={result['id']}  type={result['type']}")

    elif sub == "list":
        project_id = _flag(args, "--project")
        if not project_id:
            _err("--project is required")
        rows = _request("GET", f"/projects/{project_id}/memories") or []
        _print_table(rows, ["id", "type", "source", "title", "created_at"])

    else:
        print("Usage: cc mem [add | list] [options]")


def cmd_recall(args: list[str]) -> None:
    """cc recall --project ID QUERY"""
    project_id = _flag(args, "--project")
    limit      = _flag(args, "--limit") or "10"
    # query is everything that is NOT a flag
    query_parts = [a for a in args if not a.startswith("--") and a not in (project_id, limit)]
    query = " ".join(query_parts).strip()

    if not project_id:
        _err("--project is required")

    import urllib.parse
    qs = urllib.parse.urlencode({"query": query, "limit": limit})
    result = _request("GET", f"/projects/{project_id}/recall?{qs}")

    items = result.get("items", [])
    print(f"\n{'─'*60}")
    print(f"Query: {query!r}   ({len(items)} results)")
    print('─'*60)
    for item in items:
        rank = item.get("rank_score")
        rank_str = f"  [{rank:.3f}]" if rank is not None else ""
        print(f"[{item['type']}]{rank_str}  {item.get('title') or item['content'][:80]}")
    print()
    if result.get("memory_pack_text"):
        print("── Memory pack ──────────────────────────────────────────")
        print(result["memory_pack_text"])


def cmd_invites(args: list[str]) -> None:
    """cc invites list | create EMAIL [--notes TEXT] | revoke ID"""
    sub = args[0] if args else ""
    if sub == "list":
        query = {}
        for flag, key in [("--limit", "limit"), ("--offset", "offset"), ("--status", "status"), ("--email-q", "email_q")]:
            val = _flag(args, flag)
            if val:
                query[key] = val
        suffix = f"?{urlencode(query)}" if query else ""
        rows = _request("GET", f"/admin/invites{suffix}") or []
        _print_table(rows, ["id", "email", "status", "expires_at", "notes"])
    elif sub == "create":
        email = args[1] if len(args) > 1 and not args[1].startswith("--") else None
        if not email:
            _err("Provide email: cc invites create user@example.com")
        notes = _flag(args, "--notes")
        body: dict = {"email": email}
        if notes:
            body["notes"] = notes
        result = _request("POST", "/admin/invites", body=body)
        _ok(f"Invite created — id={result.get('id')}  email={result.get('email')}  expires={result.get('expires_at')}")
    elif sub == "revoke":
        invite_id = args[1] if len(args) > 1 else None
        if not invite_id:
            _err("Provide invite ID: cc invites revoke 42")
        _request("POST", f"/admin/invites/{invite_id}/revoke")
        _ok(f"Invite {invite_id} revoked.")
    else:
        print("Usage: cc invites [list | create EMAIL | revoke ID]")


def cmd_waitlist(args: list[str]) -> None:
    """cc waitlist list | approve ID | reject ID"""
    sub = args[0] if args else ""
    if sub == "list":
        query = {}
        for flag, key in [("--limit", "limit"), ("--offset", "offset"), ("--status", "status"), ("--email-q", "email_q")]:
            val = _flag(args, flag)
            if val:
                query[key] = val
        suffix = f"?{urlencode(query)}" if query else ""
        rows = _request("GET", f"/admin/waitlist{suffix}") or []
        _print_table(rows, ["id", "email", "status", "created_at", "reviewed_at"])
    elif sub == "approve":
        entry_id = args[1] if len(args) > 1 else None
        if not entry_id:
            _err("Provide entry ID: cc waitlist approve 7")
        result = _request("POST", f"/admin/waitlist/{entry_id}/approve")
        _ok(f"Entry {entry_id} approved — invite id={result.get('id')}  email={result.get('email')}")
    elif sub == "reject":
        entry_id = args[1] if len(args) > 1 else None
        if not entry_id:
            _err("Provide entry ID: cc waitlist reject 7")
        _request("POST", f"/admin/waitlist/{entry_id}/reject")
        _ok(f"Entry {entry_id} rejected.")
    else:
        print("Usage: cc waitlist [list | approve ID | reject ID]")


def cmd_usage(_args: list[str]) -> None:
    """cc usage — show today's usage counters and limits"""
    result = _request("GET", "/me/usage")
    today = result.get("day", "today")
    limits = result.get("limits", {})
    print(f"\nUsage for {today}")
    print(f"  Memories created : {result.get('memories_created', 0)} / {limits.get('memories_per_day', '∞')}")
    print(f"  Recall queries   : {result.get('recall_queries', 0)} / {limits.get('recalls_per_day', '∞')}")
    print(f"  Projects created : {result.get('projects_created', 0)} / {limits.get('projects_per_day', '∞')}")
    print(f"  Weekly memories  : {result.get('weekly_memories_created', 0)} / {limits.get('memories_per_week', '∞')}")
    print(f"  Weekly recalls   : {result.get('weekly_recall_queries', 0)} / {limits.get('recalls_per_week', '∞')}")
    print(f"  Weekly projects  : {result.get('weekly_projects_created', 0)} / {limits.get('projects_per_week', '∞')}")
    print()


def cmd_integrations(args: list[str]) -> None:
    """cc integrations upload --project ID --type TYPE (--text TEXT | --file PATH)
       cc integrations list [--project ID] [--limit N] [--offset N]
       cc integrations contextualize --memory-id ID"""
    sub = args[0] if args else ""
    if sub == "upload":
        project_id = _flag(args, "--project") or _flag(args, "--project-id")
        mem_type = _flag(args, "--type") or "note"
        text_val = _flag(args, "--text")
        file_path = _flag(args, "--file")
        title = _flag(args, "--title")
        if file_path:
            try:
                text_val = Path(file_path).read_text(encoding="utf-8")
            except OSError as exc:
                _err(f"Cannot read file {file_path}: {exc}")
        if not project_id or not text_val:
            _err("Usage: cc integrations upload --project ID --type TYPE (--text TEXT | --file PATH)")
        body: dict[str, Any] = {
            "project_id": int(project_id),
            "type": mem_type,
            "source": "api",
            "content": text_val,
            "metadata": {},
            "tags": [],
        }
        if title:
            body["title"] = title
        out = _request("POST", "/integrations/memories", body=body)
        _ok(f"Memory uploaded via integrations endpoint — id={out.get('id')}")
    elif sub == "list":
        query = {}
        for flag, key in [("--project", "project_id"), ("--project-id", "project_id"), ("--limit", "limit"), ("--offset", "offset")]:
            val = _flag(args, flag)
            if val:
                query[key] = val
        suffix = f"?{urlencode(query)}" if query else ""
        rows = _request("GET", f"/integrations/memories{suffix}") or []
        _print_table(rows, ["id", "project_id", "type", "source", "title", "created_at"])
    elif sub == "contextualize":
        memory_id = _flag(args, "--memory-id") or (args[1] if len(args) > 1 else None)
        if not memory_id:
            _err("Usage: cc integrations contextualize --memory-id ID")
        out = _request("POST", f"/integrations/memories/{memory_id}/contextualize")
        _ok(f"Contextualization queued for memory {out.get('memory_id')}")
    else:
        print("Usage: cc integrations [upload|list|contextualize] ...")


def cmd_seed_mock_data(args: list[str]) -> None:
    """cc seed-mock-data [--num-projects N] [--memories-per-project N]

    Seeds demo projects + memories through HTTP integration endpoints
    using the Python SDK, preserving API lineage/audit behavior.
    """
    try:
        num_projects = int(_flag(args, "--num-projects") or "3")
        memories_per_project = int(_flag(args, "--memories-per-project") or "2")
    except ValueError:
        _err("--num-projects and --memories-per-project must be integers")
    if num_projects < 1 or memories_per_project < 1:
        _err("--num-projects and --memories-per-project must be >= 1")

    cfg = _load_config()
    base_url, api_key, org_id_raw = _resolved_runtime_auth(cfg)
    if not api_key:
        _err("Missing API key. Run `cc login --api-key ...` first.")
    if not org_id_raw:
        _err("Missing org id. Run `cc login ... --org-id N` or pass --org-id.")
    try:
        org_id = int(org_id_raw)
    except ValueError:
        _err("Invalid org id. Use an integer value.")

    try:
        try:
            from .sdk import ContextCacheClient, ContextCacheError
        except ImportError:
            from sdk import ContextCacheClient, ContextCacheError
    except Exception as exc:
        _err(f"Could not import SDK: {exc}")

    client = ContextCacheClient(api_key=api_key, base_url=base_url, org_id=org_id)

    project_names_seed = ["Alpha Launch", "Q2 Planning", "Research Roadmap"]
    memory_types = ["decision", "finding", "definition", "note", "link", "todo"]
    corpus = [
        "Ship invite-only beta first, then expand to waitlist cohorts in weekly waves.",
        "Most onboarding questions were about org scoping and API key setup.",
        "A qualified memory is concise, actionable, and references a project decision.",
        "Run migration and backup dry-run before increasing beta limits.",
        "Combine FTS + vectors + recency; keep weights configurable via env.",
        "https://docs.thecontextcache.com/06-deployment/",
        "Cloudflare Tunnel routes root to web and api subdomain to FastAPI.",
        "Use semantic recall for project memory and deterministic fallbacks for test stability.",
        "Daily usage limits can be overridden by the admin is_unlimited flag.",
        "Record audit logs for project creation, memory ingestion, and recall calls.",
    ]

    try:
        existing = client.projects.list()
        project_by_name = {p.get("name"): p for p in existing if isinstance(p, dict)}
        created_projects = 0
        uploaded_memories = 0

        for project_idx in range(num_projects):
            if project_idx < len(project_names_seed):
                project_name = project_names_seed[project_idx]
            else:
                project_name = f"Mock Project {project_idx + 1}"
            project = project_by_name.get(project_name)
            if project is None:
                project = client.projects.create(project_name)
                project_by_name[project_name] = project
                created_projects += 1

            project_id = int(project["id"])
            for mem_idx in range(memories_per_project):
                global_idx = (project_idx * memories_per_project) + mem_idx
                mem_type = memory_types[global_idx % len(memory_types)]
                content = corpus[global_idx % len(corpus)]
                title = f"{project_name} memory {mem_idx + 1}"
                client.integrations.upload_memory(
                    project_id=project_id,
                    type=mem_type,
                    title=title,
                    content=content,
                    source="api",
                    metadata={
                        "seeded_by": "cc seed-mock-data",
                        "ingestion_chunk_index": mem_idx,
                        "pipeline": "cli-http-seed",
                    },
                    tags=["seed", mem_type, f"project-{project_idx + 1}"],
                )
                uploaded_memories += 1

    except ContextCacheError as exc:
        _err(f"Seeding failed: HTTP {exc.status} - {exc.detail}")
    except Exception as exc:
        _err(f"Seeding failed: {exc}")

    _ok("Mock data upload complete.")
    print(f"   base_url: {base_url}")
    print(f"   org_id:   {org_id}")
    print(f"   requested projects: {num_projects}")
    print(f"   memories per project: {memories_per_project}")
    print(f"   projects created: {created_projects}")
    print(f"   memories uploaded: {uploaded_memories}")


def cmd_admin(args: list[str]) -> None:
    """cc admin users|set-unlimited|login-events|stats|recall-logs|invites|waitlist|projects ..."""
    sub = args[0] if args else ""
    if sub == "invites":
        cmd_invites(args[1:])
        return
    if sub == "waitlist":
        cmd_waitlist(args[1:])
        return
    if sub == "projects":
        cmd_projects(args[1:] if len(args) > 1 else ["list"])
        return
    if sub == "users":
        query = {}
        for flag, key in [
            ("--limit", "limit"),
            ("--offset", "offset"),
            ("--email-q", "email_q"),
            ("--status", "status"),
            ("--is-admin", "is_admin"),
            ("--is-disabled", "is_disabled"),
        ]:
            val = _flag(args, flag)
            if val:
                query[key] = val
        suffix = f"?{urlencode(query)}" if query else ""
        rows = _request("GET", f"/admin/users{suffix}") or []
        _print_table(rows, ["id", "email", "is_admin", "is_disabled", "is_unlimited", "last_login_at"])
    elif sub == "set-unlimited":
        user_id = args[1] if len(args) > 1 else None
        val = (_flag(args, "--value") or "true").lower()
        if not user_id:
            _err("Usage: cc admin set-unlimited USER_ID [--value true|false]")
        out = _request("POST", f"/admin/users/{user_id}/set-unlimited?unlimited={'true' if val != 'false' else 'false'}")
        _ok(f"User {user_id} unlimited set to {out.get('is_unlimited')}")
    elif sub == "login-events":
        user_id = args[1] if len(args) > 1 else None
        if not user_id:
            _err("Usage: cc admin login-events USER_ID")
        rows = _request("GET", f"/admin/users/{user_id}/login-events") or []
        _print_table(rows, ["id", "ip", "created_at", "user_agent"])
    elif sub == "stats":
        user_id = args[1] if len(args) > 1 else None
        if not user_id:
            _err("Usage: cc admin stats USER_ID")
        out = _request("GET", f"/admin/users/{user_id}/stats")
        print(json.dumps(out, indent=2))
    elif sub == "recall-logs":
        query = {}
        for flag, key in [("--limit", "limit"), ("--offset", "offset"), ("--project", "project_id"), ("--project-id", "project_id")]:
            val = _flag(args, flag)
            if val:
                query[key] = val
        suffix = f"?{urlencode(query)}" if query else ""
        rows = _request("GET", f"/admin/recall/logs{suffix}") or []
        _print_table(rows, ["id", "project_id", "strategy", "query_text", "created_at"])
    else:
        print("Usage: cc admin [users|set-unlimited|login-events|stats|recall-logs|invites|waitlist|projects] ...")


# ── Argument parsing helpers ──────────────────────────────────────────────

def _flag(args: list[str], name: str) -> str | None:
    """Extract --name VALUE from args list."""
    for i, arg in enumerate(args):
        if arg == name and i + 1 < len(args):
            return args[i + 1]
        if arg.startswith(f"{name}="):
            return arg.split("=", 1)[1]
    return None


def _extract_global_overrides(args: list[str]) -> tuple[list[str], dict[str, str]]:
    cleaned: list[str] = []
    overrides: dict[str, str] = {}
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in {"--api-base", "--api-key", "--org-id"}:
            if i + 1 >= len(args):
                _err(f"{arg} requires a value")
            key = {"--api-base": "base_url", "--api-key": "api_key", "--org-id": "org_id"}[arg]
            overrides[key] = args[i + 1]
            i += 2
            continue
        if arg.startswith("--api-base="):
            overrides["base_url"] = arg.split("=", 1)[1]
            i += 1
            continue
        if arg.startswith("--api-key="):
            overrides["api_key"] = arg.split("=", 1)[1]
            i += 1
            continue
        if arg.startswith("--org-id="):
            overrides["org_id"] = arg.split("=", 1)[1]
            i += 1
            continue
        cleaned.append(arg)
        i += 1
    return cleaned, overrides


# ── Entry point ───────────────────────────────────────────────────────────

COMMANDS = {
    "help":     cmd_help,
    "--help":   cmd_help,
    "-h":       cmd_help,
    "login":    cmd_login,
    "health":   cmd_health,
    "projects": cmd_projects,
    "mem":      cmd_mem,
    "recall":   cmd_recall,
    "usage":    cmd_usage,
    "invites":  cmd_invites,
    "waitlist": cmd_waitlist,
    "integrations": cmd_integrations,
    "seed-mock-data": cmd_seed_mock_data,
    "admin": cmd_admin,
}


def main() -> None:
    global _GLOBAL_OVERRIDES
    argv, overrides = _extract_global_overrides(sys.argv[1:])
    _GLOBAL_OVERRIDES = overrides
    if not argv:
        cmd_help([])
        return

    cmd = argv[0]
    rest = argv[1:]
    fn = COMMANDS.get(cmd)
    if fn is None:
        print(f"Unknown command: {cmd!r}. Run `cc help` for usage.", file=sys.stderr)
        sys.exit(1)
    fn(rest)


if __name__ == "__main__":
    main()
