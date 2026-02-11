# Overview

<!--
  This is the main landing page for ContextCache documentation.
  It explains the problem we're solving and our approach.
  
  Key principle: We don't try to expand model context windows.
  Instead, we curate high-signal "memory packs" that humans paste into any AI tool.
-->

ContextCache is a **shared project memory layer** for teams using different AI tools.

---

## The Problem

Teams today face a fragmented AI landscape:

1. **Tool fragmentation** — Different team members use different AI tools (ChatGPT, Claude, Ollama, Copilot). Insights discovered in one tool don't transfer to another.

2. **Scattered context** — Project knowledge lives in dozens of chat threads, each tool siloed with no shared memory.

3. **Context window limits** — Every model has a finite context window. Long projects exceed it, and the AI "forgets" earlier decisions.

4. **No intentional curation** — Most tools auto-save everything, flooding memory with noise. High-signal insights get buried.

---

## The Solution

ContextCache takes a different approach:

1. **Human-curated memory cards** — Users intentionally publish high-signal insights (decisions, definitions, findings) into a shared project memory. No auto-scraping, no noise.

2. **Paste-ready memory packs** — When you need context, you call the Recall endpoint. It returns a formatted text block you paste into *any* AI tool—ChatGPT, Claude, Ollama, or anything else.

3. **Tool-agnostic by design** — No plugins, no integrations needed for MVP. One API, paste anywhere.

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTEXTCACHE                           │
│                                                             │
│   ┌──────────────┐                    ┌──────────────┐      │
│   │  Memory Card │  ──────────────▶   │ Memory Pack  │      │
│   │  (decision)  │     Recall API     │ (paste-ready)│      │
│   └──────────────┘                    └──────────────┘      │
│   ┌──────────────┐                           │              │
│   │  Memory Card │                           ▼              │
│   │  (finding)   │                    ┌──────────────┐      │
│   └──────────────┘                    │   Any AI     │      │
│   ┌──────────────┐                    │   ChatGPT    │      │
│   │  Memory Card │                    │   Claude     │      │
│   │  (definition)│                    │   Ollama     │      │
│   └──────────────┘                    └──────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## What This Is NOT (MVP)

To keep scope clear, here's what ContextCache is **not** in the MVP:

| Not This | Why |
|----------|-----|
| AI-to-AI chat | We don't connect AI models to each other |
| Agent platform | No autonomous agents scraping or acting |
| MCP-focused | MCP is Phase 3+, not MVP |
| Unlimited context magic | We don't expand model limits; we curate packs |

---

## Core Vocabulary

| Term | Definition |
|------|------------|
| **Project** | A container for related memory cards (e.g., "Backend Refactor") |
| **Memory Card** | A single piece of curated knowledge (decision, finding, definition, note, link, todo) |
| **Memory Pack** | A formatted text block returned by Recall, ready to paste into any AI |
| **Recall** | The API endpoint that generates a memory pack from stored cards |

---

## Next Steps

- **[MVP Scope](01-mvp-scope.md)** — What's in and out of MVP
- **[Architecture](02-architecture.md)** — How the system works
- **[API Contract](04-api-contract.md)** — Endpoints and payloads
