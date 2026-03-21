#!/usr/bin/env python3
from pathlib import Path


def strip_contextcache_engine_block(lines: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line == "[package.optional-dependencies]\n":
            block: list[str] = [line]
            i += 1
            while i < len(lines) and not lines[i].startswith("[") and not lines[i].startswith("[["):
                block.append(lines[i])
                i += 1
            joined = "".join(block)
            needle = 'private-engine = [\n    { name = "contextcache-engine" },\n]\n'
            if needle in joined:
                cleaned = joined.replace(needle, "")
                if cleaned.strip():
                    out.extend(cleaned.splitlines(keepends=True))
            else:
                out.extend(block)
            continue

        if line == "[package.metadata]\n":
            out.append(line)
            i += 1
            while i < len(lines) and not lines[i].startswith("[") and not lines[i].startswith("[["):
                if "contextcache-engine" not in lines[i]:
                    out.append(lines[i])
                i += 1
            continue

        if line == "[[package]]\n" and i + 1 < len(lines) and lines[i + 1] == 'name = "contextcache-engine"\n':
            i += 2
            while i < len(lines) and not lines[i].startswith("[[package]]\n"):
                i += 1
            continue

        out.append(line)
        i += 1
    return out


lock_path = Path("/app/uv.lock")
lock_path.write_text("".join(strip_contextcache_engine_block(lock_path.read_text().splitlines(keepends=True))))
