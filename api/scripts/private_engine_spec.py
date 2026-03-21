#!/usr/bin/env python3
from __future__ import annotations

import sys
import tomllib
from pathlib import Path


def main() -> int:
    lock_path = Path("/app/uv.lock")
    if not lock_path.exists():
        lock_path = Path(__file__).resolve().parents[1] / "uv.lock"
    lock = tomllib.loads(lock_path.read_text())
    packages = lock.get("package", [])

    for package in packages:
        if package.get("name") != "contextcache-engine":
            continue

        source = package.get("source") or {}
        git_ref = source.get("git")
        if not git_ref:
            continue

        if "#" in git_ref:
            url, revision = git_ref.split("#", 1)
        else:
            url, revision = git_ref, ""

        if url.startswith("ssh://"):
            url = f"git+{url}"
        elif not url.startswith("git+"):
            url = f"git+{url}"

        spec = f"contextcache-engine @ {url}"
        if revision:
            spec = f"{spec}@{revision}"

        print(spec)
        return 0

    print("contextcache-engine git source not found in uv.lock", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
