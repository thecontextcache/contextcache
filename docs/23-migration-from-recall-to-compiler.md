# Migration From Recall To Compiler

## Objective

This document defines how ContextCache should evolve from the current recall-centered product shape to the memory-compiler vision without breaking the shipped API or creating unnecessary operational risk.

The goal is not a rewrite. The goal is a controlled reframing and expansion.

## Migration Principle

Use this principle throughout the transition:

**keep the current platform stable, reinterpret recall as compiler-v1, and add new compiler capabilities incrementally**

## What Stays Stable

These elements should be treated as stable platform foundations.

- FastAPI service layout
- PostgreSQL as primary system of record
- Redis-backed rate limiting and worker coordination
- org and project scoping
- session, API-key, and optional external-auth support
- memory creation and ingest entry points
- admin and observability surfaces already in use

## What Changes In Meaning

### Memories

Old meaning:

- the main product object

New meaning:

- source evidence used by the compiler and still visible to users

### Recall

Old meaning:

- the product's central output

New meaning:

- one renderer produced by the compiler

### Tags and summaries

Old meaning:

- lightweight helpers and formatting aids

New meaning:

- early scaffolding for concept and hierarchy layers

### Worker jobs

Old meaning:

- optional processing support

New meaning:

- critical derivation and consolidation infrastructure

## Documentation Strategy

The docs should be explicit about time horizons so readers understand what is historical, what is current, and what is next.

### Historical

- `/Users/nd/Documents/contextcache/docs/01-mvp-scope.md`

Purpose:

- preserve the original MVP boundary and rationale

### Current source of truth

- `/Users/nd/Documents/contextcache/docs/04-api-contract.md`
- `/Users/nd/Documents/contextcache/docs/02-architecture.md`

Purpose:

- describe the shipped and supported platform today

### New direction

- `/Users/nd/Documents/contextcache/docs/21-product-vision.md`
- `/Users/nd/Documents/contextcache/docs/22-memory-compiler-architecture.md`
- this document

Purpose:

- define where the platform is going and how we get there safely

## Migration Phases

### Phase 0 — Narrative Alignment

Goal:

- align docs and product language

Actions:

- label the MVP doc as historical baseline
- add memory-compiler vision docs
- update docs navigation and home page
- describe recall as the first compiler renderer

No breaking API changes in this phase.

### Phase 1 — Compiler Logging And Renderer Framing

Goal:

- make the existing recall path compiler-aware before new product objects are added

Actions:

- introduce `context_compilations` and `context_compilation_items`
- log how recall outputs were assembled
- add renderer metadata to responses where appropriate
- keep existing recall response shape stable

Effect on API:

- additive only

### Phase 2 — Concept And Relation Layer

Goal:

- start building durable semantic structure over source memories

Actions:

- add concepts and aliases
- add memory-to-concept links
- add memory relations such as supports, contradicts, and supersedes
- add lifecycle state transitions for stale and superseded memory

Effect on API:

- new endpoints for concepts and state management
- no removal of memory endpoints

### Phase 3 — Episodes And Summary Pyramid

Goal:

- support multi-timescale continuity and resumption

Actions:

- add episodes and episode-memory links
- add summary nodes over episodes and projects
- introduce project resume and delta endpoints

Effect on API:

- additive new surfaces
- recall may begin to include richer compiled metadata internally while preserving current compatibility

### Phase 4 — Rich Renderers

Goal:

- move beyond a single recall text block

Actions:

- add `TOON-X/1`
- add `Brief/1`
- add `Delta/1`
- add `Proof/1`
- keep recall pack text as a supported renderer

Effect on API:

- new compile and export endpoints
- existing recall endpoint remains supported

### Phase 5 — Policy And Optimization

Goal:

- make the compiler adaptive and self-improving

Actions:

- add feedback capture for helpful, wrong, stale, removed, and pinned items
- train retrieval, reranking, and compression models
- add query profiles and anticipatory compiler behavior

Effect on API:

- more admin evaluation and quality endpoints
- richer client inspection surfaces

## Endpoint Positioning

The easiest way to avoid confusion is to define the old and new endpoint roles clearly.

### Endpoints that remain foundational

- `/projects/{project_id}/memories`
- `/integrations/memories`
- `/ingest/raw`
- admin ops, eval, and security routes

### Endpoints that become compiler surfaces

- `/projects/{project_id}/recall`
- future `/projects/{project_id}/context/compile`
- future `/projects/{project_id}/resume`
- future `/projects/{project_id}/delta`

### Endpoint rule

If an endpoint already exists and is useful, prefer reinterpreting and extending it over replacing it outright.

## Compatibility Contract

The migration should follow these compatibility rules.

### API compatibility

- existing documented routes stay valid unless a versioned replacement is introduced
- additive fields are preferred over response shape breaks
- future richer outputs should be opt-in when possible

### Data compatibility

- source memories remain durable and queryable
- derived structures do not erase underlying evidence
- migration tables should be additive and backfillable

### Operational compatibility

- worker and ingest hardening remains mandatory
- org isolation and auth guarantees remain unchanged
- admin observability must expand with the compiler, not regress

## What We Should Not Do

To keep the migration healthy, avoid these moves.

- do not relabel everything at once without phased docs and API support
- do not drop recall before richer renderers are production-ready
- do not replace PostgreSQL prematurely
- do not add a graph database before proving the need
- do not block user value on training a giant custom model

## Definition Of Success

We can say the migration is working when these are true.

### Product

- users understand that ContextCache compiles context rather than merely storing notes
- Resume Mode and delta workflows provide clear value beyond simple recall
- richer outputs coexist with the original recall pack without confusion

### Technical

- compiler artifacts are logged and inspectable
- derived memory structures are traceable to source memories
- quality metrics improve for retrieval, compilation, and resume workflows
- current platform stability is preserved during rollout

### Documentation

- readers can clearly distinguish historical MVP scope from current shipped API and future direction
- product, architecture, and migration docs agree with each other
- new contributors can understand why recall remains while the compiler system grows around it

## Recommended Messaging

Use these statements consistently.

### Internal

> Recall was the first successful compiler output, not the final form of the product.

### External

> ContextCache started as a curated recall system and is evolving into a memory compiler that turns project work into reliable context for humans and AI systems.

## Closing Position

We are replacing the old product thesis, not destroying the shipped platform.

That distinction matters.

The right move is to preserve the stable foundation, reinterpret the successful parts, and expand the system until the memory-compiler model becomes the obvious center of gravity.
