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
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass  # stdlib — always available

# ── Config persistence ─────────────────────────────────────────────────────

CONFIG_DIR  = Path(os.getenv("CC_CONFIG_DIR", Path.home() / ".contextcache"))
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_BASE_URL = "https://api.thecontextcache.com"


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
    url = (base_url or cfg.get("base_url", DEFAULT_BASE_URL)).rstrip("/") + path
    key = api_key or cfg.get("api_key", "")
    oid = str(org_id or cfg.get("org_id") or "")

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
    api_key  = _flag(args, "--api-key")
    base_url = _flag(args, "--base-url") or DEFAULT_BASE_URL
    org_id   = _flag(args, "--org-id")

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


def cmd_usage(_args: list[str]) -> None:
    """cc usage — show today's usage counters and limits"""
    result = _request("GET", "/me/usage")
    today = result.get("day", "today")
    limits = result.get("limits", {})
    print(f"\nUsage for {today}")
    print(f"  Memories created : {result.get('memories_created', 0)} / {limits.get('memories_per_day', '∞')}")
    print(f"  Recall queries   : {result.get('recall_queries', 0)} / {limits.get('recalls_per_day', '∞')}")
    print(f"  Projects created : {result.get('projects_created', 0)} / {limits.get('projects_per_day', '∞')}")
    print()


# ── Argument parsing helpers ──────────────────────────────────────────────

def _flag(args: list[str], name: str) -> str | None:
    """Extract --name VALUE from args list."""
    for i, arg in enumerate(args):
        if arg == name and i + 1 < len(args):
            return args[i + 1]
        if arg.startswith(f"{name}="):
            return arg.split("=", 1)[1]
    return None


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
}


def main() -> None:
    argv = sys.argv[1:]
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
