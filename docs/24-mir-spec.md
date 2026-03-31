# MIR/1 Specification

## Purpose

`MIR/1` is the canonical internal representation for compiled memory in ContextCache.

It exists to solve three problems:

1. storage and rendering should not drift apart
2. evaluation should operate on a stable intermediate form
3. new renderers should compile from one source of truth rather than inventing their own structures

In practical terms:

- source memories remain the durable evidence layer
- `MIR/1` is the compiler's internal working format
- renderers like recall text, `TOON-X`, `Brief`, and `Delta` compile from `MIR/1`

## Versioning

- current version string: `mir/1`
- future revisions must be additive when possible
- breaking semantic changes should increment the major version

## Document Model

A `MIR/1` payload is a document containing:

- compiler metadata
- target metadata
- an ordered set of typed memory items

## Top-Level Shape

```json
{
  "version": "mir/1",
  "renderer": "recall-pack/v1",
  "project_id": 12,
  "query": "migration reliability",
  "generated_at": "2026-03-30T18:00:00Z",
  "memory_pack_text": "## Decisions\\n- ...",
  "items": []
}
```

## Top-Level Fields

### `version`

Type:

- string

Required:

- yes

Allowed values for this revision:

- `mir/1`

### `renderer`

Type:

- string

Required:

- yes

Meaning:

- identifies the renderer or output family associated with this compilation

Examples:

- `recall-pack/v1`
- `toon/v1`
- `toon-x/v1`
- `brief/v1`
- `delta/v1`
- `proof/v1`

### `project_id`

Type:

- integer

Required:

- yes

### `query`

Type:

- string

Required:

- yes

Meaning:

- user or system query that triggered compilation

### `generated_at`

Type:

- timestamp

Required:

- yes

Meaning:

- when the compilation was produced

### `memory_pack_text`

Type:

- string or null

Required:

- no

Meaning:

- convenience copy of the rendered output when a text renderer already exists
- useful during migration while recall remains an official renderer

### `items`

Type:

- ordered list of `MIRItem`

Required:

- yes

Meaning:

- ordered compiler units selected for the output

## Item Model

Each `MIRItem` is a typed, evidence-aware unit of compiled context.

## Item Fields

### `id`

Type:

- string

Required:

- yes

Rules:

- stable within the compilation
- for source memory-backed items, prefer `memory:<id>`
- for future derived objects, use prefixes like `concept:`, `episode:`, `summary:`, `delta:`

### `kind`

Type:

- enum string

Required:

- yes

Allowed values in `mir/1`:

- `fact`
- `decision`
- `constraint`
- `procedure`
- `episode`
- `concept`
- `artifact`
- `delta`
- `conflict`
- `unknown`
- `next_hop`

### `content`

Type:

- string

Required:

- yes

Meaning:

- the normalized text content of the compiled item

### `title`

Type:

- string or null

Required:

- no

### `scope`

Type:

- object

Required:

- yes

Current fields:

- `level`: `memory | query | project | org | episode`
- `project_id`: integer or null
- `org_id`: integer or null
- `episode_id`: integer or null

### `confidence`

Type:

- number from `0` to `1`, or null

Required:

- no

Meaning:

- compiler confidence in the usefulness or correctness of this item as represented

Important:

- `null` does not mean low confidence
- `null` means the compiler has not assigned a calibrated value

### `freshness`

Type:

- object or null

Required:

- no

Current fields:

- `status`: `fresh | aging | stale | unknown`
- `age_days`: integer or null

### `importance`

Type:

- number from `0` to `1`, or null

Required:

- no

Meaning:

- compiler-estimated importance independent of query match

### `rank`

Type:

- integer or null

Required:

- no

Meaning:

- 1-based output order within the compiled result

### `concept_refs`

Type:

- list of strings

Required:

- yes

Meaning:

- IDs of referenced concept objects when available

### `evidence_refs`

Type:

- list of strings

Required:

- yes

Meaning:

- IDs of source evidence objects backing the item

For source-memory items:

- include self-reference, for example `memory:123`

### `contradicts`

Type:

- list of strings

Required:

- yes

Meaning:

- item IDs contradicted by this item, if known

### `supersedes`

Type:

- list of strings

Required:

- yes

Meaning:

- item IDs superseded by this item, if known

### `why_included`

Type:

- string or null

Required:

- no

Meaning:

- short human-readable explanation for inclusion in this compilation

Examples:

- `matched query terms`
- `recent high-signal decision`
- `open next step`
- `supporting evidence for migration reliability`

### `source_memory_id`

Type:

- integer or null

Required:

- no

Meaning:

- source memory backing this item when applicable

### `source_memory_type`

Type:

- string or null

Required:

- no

Meaning:

- current memory type taxonomy from the stored memory record

### `tags`

Type:

- list of strings

Required:

- yes

### `created_at`

Type:

- timestamp or null

Required:

- no

## Mapping Rules For Current Recall

During the migration period, the compiler maps current memory types into `MIR/1` kinds using these defaults.

| Memory type | MIR kind |
|---|---|
| `decision` | `decision` |
| `todo` | `next_hop` |
| `link` | `artifact` |
| `doc` | `artifact` |
| `code` | `artifact` |
| `file` | `artifact` |
| `web` | `artifact` |
| `chat` | `artifact` |
| `snippet` | `artifact` |
| `finding` | `fact` |
| `definition` | `fact` |
| `note` | `fact` |
| `context` | `fact` |
| `event` | `fact` |
| `issue` | `fact` |

This mapping is intentionally conservative.

Richer typing should come from later concept and policy layers, not from over-guessing at the first migration step.

## Example Item

```json
{
  "id": "memory:45",
  "kind": "decision",
  "content": "Use timestamped integration signing and reject stale signatures.",
  "title": "Signing hardening",
  "scope": {
    "level": "project",
    "project_id": 12,
    "org_id": null,
    "episode_id": null
  },
  "confidence": 0.91,
  "freshness": {
    "status": "fresh",
    "age_days": 2
  },
  "importance": 0.91,
  "rank": 1,
  "concept_refs": [],
  "evidence_refs": ["memory:45"],
  "contradicts": [],
  "supersedes": [],
  "why_included": "matched query terms and ranked highly",
  "source_memory_id": 45,
  "source_memory_type": "decision",
  "tags": ["security", "integrations"],
  "created_at": "2026-03-28T10:15:00Z"
}
```

## Compiler Invariants

These rules should hold for every `MIR/1` document.

1. every item must have a stable `id`
2. every item must have a `kind`
3. every item must have non-empty `content`
4. every item must include a `scope`
5. every item must include `evidence_refs`, even if only self-backed
6. ordered items should have a stable `rank`
7. renderers must not invent unsupported semantics that are absent from `MIR/1`

## What `MIR/1` Is Not

`MIR/1` is not:

- the database schema
- the user-facing renderer format
- a graph database replacement
- the raw source memory object

It is the compiler’s stable intermediate contract.

## Relationship To Renderers

Renderers compile from `MIR/1`.

### Current renderer

- recall pack text

### Planned renderers

- `TOON-X/1`
- `Brief/1`
- `Delta/1`
- `Proof/1`

## Relationship To Future Work

After `MIR/1`, the next specs should be:

1. `TOON-X/1`
2. database migration plan for compiler tables
3. API evolution plan for compile, resume, delta, and feedback routes
