# Ant Colony Optimization (ACO) Cache

The ContextCache platform implements a **dynamic, reinforcement-based caching layer** inspired by Ant Colony Optimization algorithms, replacing a traditional static Cache-Augmented Generation (CAG) mechanism.

This document describes how the ACO cache works, how pheromones are applied, and how data evaporates or gets evicted to maintain fresh context budgets.

## Principles of ACO in ContextCache

The objective is to ensure that the *most relevant* and *frequently useful* data chunk memories remain in the fast, in-memory KV-cache budget of LLM generation models, while obsolete or low-value information gracefully decays and drops out.

### 1. Pheromone Reinforcement
Whenever a Memory Chunk is surfaced repeatedly through standard Hybrid Recall (FTS + Vector search) and actively selected or interacted with by a downstream consumer, the system deposits a "pheromone" boost on that specific chunk (`CAG_PHEROMONE_HIT_BOOST=0.2`). Check `promote_cag_chunk` in the core engine.

```python
# In api/app/analyzer/cag.py
chunk.pheromone_level = max(
    CAG_PHEROMONE_MIN,
    min(CAG_PHEROMONE_MAX, chunk.pheromone_level + CAG_PHEROMONE_HIT_BOOST)
)
```

### 2. Evaporation Layer (Decay)
Pheromones naturally decay (evaporate) over time if the chunk is not continually accessed. A background worker loop in `main.py` explicitly runs an evaporation function (`cag.maybe_evaporate_due()`) at configured intervals (`CAG_EVAPORATION_INTERVAL_SECONDS`).

Each cycle decreases the pheromone concentration for all loaded chunks by `CAG_PHEROMONE_EVAP_RATE` (e.g., `0.05`). 

```python
chunk.pheromone_level = max(CAG_PHEROMONE_MIN, chunk.pheromone_level - CAG_PHEROMONE_EVAP_RATE)
```

### 3. Hybrid Eviction Policy
Because the memory budget is finite (`CAG_MAX_TOKENS=32000`, `CAG_CACHE_MAX_ITEMS=1000`), the cache will eventually fill up. The eviction process triggers an *evict-to-capacity* response when bounds are exceeded. 

Chunks compete to stay alive based on:
1. **Pheromone Level:** The primary metric. Lowest pheromones are popped first.
2. **Access Recency (Tiebreaker):** Older chunk access is evicted before recently hit ones.
3. **Creation At (Tiebreaker):** LIFO style last resort.

## Integrating with the RAG Loop
When a standard RAG hit clears an upper confidence threshold (e.g., `vector_min_score`), the top result gets immediately processed by `promote_cag_chunk()`. This creates a secondary flywheel that keeps high-fidelity facts immediately accessible on the "hot" path without waiting for explicit promotion protocols.

## Monitoring
System performance related to the CAG is exposed at the `/health/perf` admin endpoint. It yields:
- Enabled state
- Active memory Mode
- Item Count
- Current Estimated Tokens
- Total Eviction counts
- Cache creation/update timestamps
