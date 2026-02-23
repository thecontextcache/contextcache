"""recall.py — memory pack formatting with multi-format output.

Algorithm logic lives in app.analyzer.algorithm (server-only).
This module extends the pack builder with TOON (Token-Oriented Object Notation)
support for compact, agent-friendly output.

Output formats
--------------
text  (default)
    Human-readable structured text grouped by memory type:

        PROJECT MEMORY PACK
        Query: <query>

        DECISION:
        - <content>
        ...

toon
    Compact token-optimised format for AI agents. Strips excessive
    whitespace from content and uses a minimal schema:

        Memories[N] { type, content }:
        decision  <content>
        todo      <content>

    Saves ~30-60 % tokens compared to the "text" format for agent
    consumption where the full section headers add no value.
"""
from __future__ import annotations

import re
from typing import List, Tuple

from .analyzer.algorithm import _build_pack


def _build_toon_pack(query: str, items: List[Tuple[str, str]]) -> str:
    """Build a TOON-formatted memory pack.

    Strips excessive newlines / whitespace from each content entry to
    keep the output as token-lean as possible.
    """
    if not items:
        return f"Memories[0] {{ type, content }}:\n(no memories)"

    def _compress(text: str) -> str:
        # Collapse runs of whitespace/newlines into a single space.
        return re.sub(r"\s+", " ", (text or "").strip())

    lines = [f"Memories[{len(items)}] {{ type, content }}:"]
    for mem_type, content in items:
        t = (mem_type or "note").strip()
        c = _compress(content)
        lines.append(f"{t}\t{c}")

    return "\n".join(lines)


def build_memory_pack(
    query: str,
    items: List[Tuple[str, str]],
    output_format: str = "text",
) -> str:
    """Format (type, content) pairs into a structured memory pack.

    Parameters
    ----------
    query:
        The original recall query (used as a header in text format).
    items:
        List of (memory_type, content) tuples in ranked order.
    output_format:
        ``"text"``  — human-readable, grouped by type (default).
        ``"toon"``  — compact Token-Oriented Object Notation for agents.

    Returns
    -------
    str
        Formatted pack text ready to paste into any AI tool.
    """
    if output_format == "toon":
        return _build_toon_pack(query, items)
    return _build_pack(query, items)
