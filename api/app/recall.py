from __future__ import annotations

from typing import List, Tuple


def build_memory_pack(query: str, items: List[Tuple[str, str]]) -> str:
    # items: (type, content)
    lines = ["PROJECT MEMORY PACK", f"Query: {query}", ""]
    grouped: dict[str, list[str]] = {}
    for t, c in items:
        grouped.setdefault(t, []).append(c)

    order = ["decision", "definition", "finding", "todo", "link", "note"]
    for t in order:
        if t in grouped:
            lines.append(f"{t.upper()}:")
            for c in grouped[t]:
                lines.append(f"- {c}")
            lines.append("")

    # any leftover types
    for t, arr in grouped.items():
        if t in order:
            continue
        lines.append(f"{t.upper()}:")
        for c in arr:
            lines.append(f"- {c}")
        lines.append("")

    return "\n".join(lines).strip()
