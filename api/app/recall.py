from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List, Tuple

WORD_RE = re.compile(r"[a-z0-9]+")

# tiny stopword list (MVP-safe)
STOPWORDS = {
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "was", "were",
    "be", "been", "it", "this", "that", "as", "by", "from", "at",
}

def tokenize(text: str) -> set[str]:
    tokens = {t for t in WORD_RE.findall(text.lower()) if t and t not in STOPWORDS}
    return tokens


@dataclass(frozen=True)
class Scored:
    score: float
    memory_id: int


def score_memory(query: str, content: str, created_at: datetime) -> float:
    q_tokens = tokenize(query)
    c_tokens = tokenize(content)

    if not q_tokens:
        return 0.0

    overlap = len(q_tokens.intersection(c_tokens))
    density = overlap / (len(q_tokens) + 1)

    # recency boost: newer => slightly higher
    now = datetime.now(timezone.utc)
    created = created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    age_hours = max(0.0, (now - created).total_seconds() / 3600.0)
    recency_boost = 1.0 / (1.0 + age_hours / 24.0)

    return (3.0 * overlap) + (2.0 * density) + (1.0 * recency_boost)


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
