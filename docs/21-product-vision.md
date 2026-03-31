# Product Vision — Memory Compiler

## Why This Exists

ContextCache started with a tight MVP promise: create projects, store curated memory cards, and return a paste-ready recall pack.

That MVP was the right starting point. It proved three important things:

1. Teams do benefit from storing high-signal project memory outside any single chat thread.
2. Retrieval quality matters more than raw storage volume.
3. The useful output is not "all the memory". The useful output is the right context for the next task.

The product has already grown beyond the original MVP shape. The shipped API now includes:

- organisation-scoped projects and memberships
- API keys and session auth
- ingest and replay paths
- worker-backed processing
- operational and security admin surfaces
- evaluation and runtime diagnostics

That broader platform needs a clearer product center.

## New Product Thesis

ContextCache is not just a memory store and not just a recall endpoint.

**ContextCache is a memory compiler for humans, teams, and AI systems.**

It ingests work, preserves source evidence, consolidates meaning over time, and compiles the right context for a target task, model, or user.

## Category Definition

We should position ContextCache as:

**A memory compiler platform for project continuity and agent context.**

That is deliberately different from these adjacent categories:

- not just note-taking
- not just enterprise search
- not just vector retrieval
- not just passive recording
- not just an agent runtime

The core job is:

**turn messy, evolving work into reliable, task-ready context**

## Core Promise

The product promise should shift from:

> store memory cards and get a recall pack

To:

> resume serious work quickly with the exact context that matters now

The clearest wedge is:

**Resume any serious project in 30 seconds with the exact context you need.**

## What We Keep

The memory-compiler vision is an evolution of the shipped system, not a hard reset.

We keep:

- FastAPI + PostgreSQL as the platform core
- organisation, project, and auth foundations
- memories as durable source evidence
- ingest and replay flows
- admin observability and security surfaces
- recall as a useful output path
- worker-backed asynchronous processing

These are assets, not dead ends.

## What Changes

The main change is the product center of gravity.

Old center:

- memory cards
- recall query
- formatted memory pack

New center:

- capture
- structure
- consolidate
- compile
- render
- improve via feedback

In this model:

- memories are source units, not the final product
- recall is one renderer, not the whole system
- summaries, concepts, episodes, deltas, and conflicts become first-class outputs
- output is adapted to the target model, user, task, and token budget

## Product Objects

The compiler vision introduces a clearer hierarchy of memory objects.

### Source Memories

These are the original durable records.

Examples:

- notes
- decisions
- findings
- links
- todos
- raw ingest-derived memories

Role:

- preserve evidence
- retain provenance
- anchor later derivations

### Concepts

Canonical semantic units extracted across memories.

Examples:

- "ingest reliability"
- "timestamped signing"
- "batch undo semantics"

Role:

- make recall meaning-aware
- reduce duplication
- support stable long-term project knowledge

### Episodes

Groups of related memories representing a coherent unit of work.

Examples:

- a deploy session
- a debugging session
- a design review
- a migration effort

Role:

- help users resume work by time and task
- provide narrative continuity

### Summary Nodes

Hierarchical summaries over source memories and episodes.

Levels may include:

- memory-group summaries
- episode summaries
- project summaries
- org doctrine summaries

Role:

- support multi-scale retrieval
- reduce token cost
- improve long-horizon continuity

### Compiled Context Packs

Compiler outputs assembled for a specific consumer.

Examples:

- low-token transport for an agent
- human-readable resume brief
- delta since last session
- evidence-first proof pack

Role:

- make memory directly usable
- adapt output to target constraints

## Primary User Experiences

### Resume Mode

For a user re-entering a project after time away.

Questions it should answer:

- what changed?
- what matters now?
- what is unresolved?
- what should the next model know before helping?

### Context Studio

For inspecting and correcting compiled context.

Capabilities:

- see why an item was included
- pin or remove items
- mark items stale or wrong
- inspect supporting evidence

### Agent Pack Export

For model and tool integration.

Outputs:

- compact context transport
- task-oriented brief
- delta summary
- evidence-first proof pack

### Concept Explorer

For understanding durable project knowledge.

Capabilities:

- inspect extracted concepts
- see aliases and linked evidence
- follow supporting and conflicting memories

## Design Principles

### Evidence Before Magic

Every important compiled claim should be traceable to source memories.

### Compilation Over Dumping

The job is not to return the biggest context block. The job is to return the smallest useful one.

### Human Correction Is Part Of The Product

Users must be able to inspect, refine, and invalidate memory.

### Multi-Timescale Memory

Users need different views for:

- recent changes
- episodic continuity
- semantic facts
- strategic doctrine

### Model-Aware Rendering

Different models and tools need different output formats and compression levels.

## Success Criteria

We should judge this direction by concrete outcomes.

### Product outcomes

- users resume active projects faster
- fewer missing-context failures in follow-up work
- lower token usage for equivalent or better results
- higher trust due to evidence and editability
- stronger retention because the product improves continuity, not just storage

### System outcomes

- better retrieval precision and ranking quality
- structured concept coverage over high-value projects
- measurable reduction in duplicated memory
- clearer freshness and stale-memory handling
- operational visibility into compiler quality and latency

## Non-Goals

This vision does not require us to:

- replace PostgreSQL
- introduce a graph database immediately
- discard the current API surface
- train a giant foundation model from scratch first
- force every workflow through a single output format

## Positioning Statement

A concise external positioning statement:

> ContextCache is a memory compiler that turns evolving project work into reliable, model-ready context.

A concise internal positioning statement:

> The product is no longer centered on storing memory cards. It is centered on compiling trustworthy context from evidence.

## Relationship To Existing Docs

- `/Users/nd/Documents/contextcache/docs/01-mvp-scope.md` remains the historical MVP baseline.
- `/Users/nd/Documents/contextcache/docs/04-api-contract.md` remains the source of truth for the shipped API.
- This document defines the new product center and future direction.

## Immediate Implications

The next architecture and roadmap work should follow this order:

1. define the internal compiler representation
2. define renderer formats beyond the current recall pack
3. add structured memory layers for concepts, episodes, and summaries
4. add feedback loops and evaluation tied to compiler quality
5. evolve recall into one compiler surface among several
