# Knowledge Representation Learning (KRL) Service

## Overview

The KRL service provides knowledge graph embedding capabilities using TransE-style models. It learns vector representations for entities and relations that capture the structure of the knowledge graph, enabling:

- **Entity similarity search**: Find entities that are structurally similar in the graph
- **Fact plausibility scoring**: Assess how well facts fit the learned graph structure  
- **Graph-aware retrieval**: Enhance RAG with relationship-based context
- **Improved ranking**: Incorporate graph structure into fact ranking

## Quick Start

### 1. Run Database Migration

```bash
psql $DATABASE_URL -f api/migrations/004_add_krl_support.sql
```

### 2. Train Embeddings

```python
from cc_core.services.krl_service import KRLService
from cc_core.storage.adapters.postgres import PostgresAdapter

# Initialize
storage = PostgresAdapter(database_url, encryption_key)
await storage.connect()

krl_service = KRLService(storage=storage)

# Train
result = await krl_service.train_and_update_embeddings(project_id)
print(f"Trained {result['num_entities']} entities in {result['training_duration_seconds']:.1f}s")
```

### 3. Use in RAG Queries

```python
from cc_core.services.rag_cag_service import RAGCAGService

rag_service = RAGCAGService(
    storage=storage,
    ranking_service=ranking_service
)

result = await rag_service.query(
    query="Your question here",
    project_id=project_id,
    facts=facts,
    use_graph_context=True  # Enable KRL-powered graph augmentation
)
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 KRLService                          │
│                                                     │
│  1. Load entities, relations, facts                │
│  2. Build training triples: (h, r, t)              │
│  3. Train TransE model: h + r ≈ t                  │
│  4. Extract embeddings                             │
│  5. Compute fact plausibility scores               │
│  6. Save to database                               │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              PostgreSQL Storage                     │
│                                                     │
│  entities.krl_embedding: BYTEA (serialized)        │
│  relations.krl_embedding: BYTEA (serialized)       │
│  facts.krl_score: FLOAT (0-1)                      │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│           RankingService + RAGCAGService            │
│                                                     │
│  - Entity similarity search (cosine)               │
│  - Neighborhood expansion (BFS)                    │
│  - Graph context snippets                          │
│  - Combined ranking: PR × decay × conf × KRL       │
└─────────────────────────────────────────────────────┘
```

## TransE Model

TransE learns embeddings such that: **h + r ≈ t**

Where:
- **h** = head entity embedding
- **r** = relation embedding
- **t** = tail entity embedding

The model minimizes the distance between (h + r) and t for valid triples, while maximizing it for invalid triples.

**Loss Function:**
```
L = Σ max(0, margin - score(h,r,t) + score(h',r,t'))
```

Where (h',r,t') are negative samples (corrupted triples).

## Configuration

### Training Parameters

```python
KRLService(
    storage=storage,
    embedding_dim=100,      # 50-200 typical (higher = more expressive, slower)
    epochs=100,             # 50-200 typical (more = better fit, longer training)
    batch_size=128,         # 64-256 typical (higher = faster, more memory)
    learning_rate=0.01,     # 0.001-0.1 typical (tune based on loss)
    margin=1.0,             # 0.5-2.0 typical (separation between pos/neg)
    negative_samples=5,     # 1-10 typical (more = better, slower)
    device='cpu'            # 'cpu' or 'cuda' (GPU recommended for large graphs)
)
```

### Recommended Settings by Project Size

| Project Size | Entities | embedding_dim | epochs | batch_size | Training Time |
|--------------|----------|---------------|--------|------------|---------------|
| Small        | < 500    | 50            | 50     | 64         | ~30s          |
| Medium       | 500-5000 | 100           | 100    | 128        | 2-5min        |
| Large        | > 5000   | 150           | 150    | 256        | 10-30min      |

## API Reference

### KRLService

#### `train_and_update_embeddings(project_id: UUID) -> Dict`

Train embeddings and save to database.

**Returns:**
```python
{
    "status": "completed",
    "num_entities": 1234,
    "num_relations": 56,
    "num_triples": 5678,
    "final_loss": 0.234,
    "entities_updated": 1234,
    "facts_scored": 5678,
    "training_duration_seconds": 45.2
}
```

#### `find_similar_entities(project_id: UUID, entity_id: UUID, top_k: int) -> List[Tuple[Entity, float]]`

Find entities similar to a given entity using cosine similarity on KRL embeddings.

### RankingService

#### `retrieve_graph_context_for_query(project_id: UUID, query_embedding: List[float], ...) -> Dict`

Retrieve graph context for a query:
1. Find entities similar to query embedding
2. Expand their neighborhood
3. Format as context snippets

**Returns:**
```python
{
    "matched_entities": [...],
    "expanded_graph": {...},
    "context_snippets": [...],
    "metadata": {...}
}
```

#### `rank_facts_with_scores(facts: List[Fact], use_krl: bool, include_explanation: bool) -> List[Dict]`

Rank facts with combined scoring.

**Formula:** `pagerank × decay × confidence × krl_score`

### RAGCAGService

#### `query(..., use_graph_context: bool = True) -> Dict`

Enhanced RAG query with optional graph augmentation.

**Graph Context Toggle:**
- `use_graph_context=True`: Full graph augmentation (entity similarity + neighborhood)
- `use_graph_context=False`: Traditional RAG only (faster)

## Performance

### Training Performance

**Small Project (500 entities, 2000 triples):**
- CPU: ~30 seconds
- GPU: ~15 seconds

**Medium Project (2000 entities, 10000 triples):**
- CPU: ~3 minutes
- GPU: ~45 seconds

**Large Project (10000 entities, 50000 triples):**
- CPU: ~20 minutes
- GPU: ~5 minutes

### Query Performance

**Graph Context Overhead:**
- Entity similarity search: +20-50ms
- Neighborhood expansion (depth=1): +30-80ms
- **Total overhead**: +50-150ms per query

**Optimization Tips:**
- Limit `top_k_entities` to 3-5
- Use `expand_depth=1` (rarely need depth=2)
- Set `min_similarity` threshold to 0.3-0.5
- Consider caching entity embeddings in memory

## Monitoring & Debugging

### Check Training Status

```sql
SELECT * FROM krl_training_runs 
WHERE project_id = 'your-project-id' 
ORDER BY started_at DESC 
LIMIT 5;
```

### Check Embedding Coverage

```sql
-- Entities with embeddings
SELECT COUNT(*) FROM entities 
WHERE krl_embedding IS NOT NULL;

-- Facts with KRL scores
SELECT COUNT(*) FROM facts 
WHERE krl_score IS NOT NULL;
```

### View Score Distribution

```sql
-- KRL score distribution
SELECT 
    ROUND(krl_score::numeric, 1) as score_bucket,
    COUNT(*) as num_facts
FROM facts
WHERE krl_score IS NOT NULL
GROUP BY score_bucket
ORDER BY score_bucket DESC;
```

### Debug Ranking

```python
# Get explanation for ranking
ranked = ranking_service.rank_facts_with_scores(
    facts=facts,
    use_krl=True,
    include_explanation=True
)

for item in ranked[:5]:
    print(item['explanation']['computation'])
```

## Common Issues

### "Not enough entities to train"

**Cause:** Project has < 2 entities or < 1 relation.

**Solution:** Ensure project has sufficient graph structure. KRL requires at least:
- 2 entities
- 1 relation
- 10 triples (recommended minimum)

### "Graph context always empty"

**Cause:** Entities don't have KRL embeddings or query similarity too low.

**Solution:**
1. Verify training completed: Check `krl_training_runs` table
2. Check embeddings exist: `SELECT COUNT(*) FROM entities WHERE krl_embedding IS NOT NULL`
3. Lower `min_similarity` threshold (try 0.2 instead of 0.3)
4. Increase `top_k_entities` (try 10 instead of 5)

### "Training runs out of memory"

**Cause:** Project too large for available RAM.

**Solution:**
- Reduce `batch_size` (try 32 or 64)
- Reduce `embedding_dim` (try 50)
- Reduce `negative_samples` (try 1 or 3)
- Use GPU if available
- Implement project pagination (split large projects)

### "Query latency too high"

**Cause:** Graph retrieval overhead.

**Solution:**
- Reduce `top_k_entities` (try 3)
- Set higher `min_similarity` (try 0.5)
- Use `expand_depth=1` only
- Disable graph context for latency-sensitive queries: `use_graph_context=False`
- Cache entity embeddings in application memory

## Best Practices

### When to Use KRL

✅ **Good Use Cases:**
- Large, well-connected knowledge graphs
- Entity-centric queries ("Tell me about X")
- Exploratory queries ("What's related to X?")
- Ranking with many similar facts

❌ **Less Suitable:**
- Very sparse graphs (< 10 entities)
- Disconnected entities
- Latency-critical applications (< 100ms SLA)
- Frequently changing graphs (daily training expensive)

### Training Schedule

- **Initial**: Train after importing first batch of facts
- **Incremental**: Retrain weekly for active projects
- **Maintenance**: Monthly for stable projects
- **On-demand**: After major graph updates

### Monitoring

Track these metrics:
- Training loss (should decrease over epochs)
- Training duration (baseline for performance regression)
- Entity embedding coverage (% with embeddings)
- Fact KRL score distribution (should be spread 0.2-0.9)
- Query latency with/without graph context

### Tuning

**If loss not decreasing:**
- Increase `epochs` (try 200)
- Decrease `learning_rate` (try 0.005)
- Increase `embedding_dim` (try 150)

**If training too slow:**
- Decrease `epochs` (try 50)
- Increase `batch_size` (try 256)
- Decrease `negative_samples` (try 3)
- Use GPU (`device='cuda'`)

**If query latency too high:**
- Decrease `top_k_entities` (try 3)
- Increase `min_similarity` (try 0.5)
- Cache embeddings in memory
- Disable graph context for some queries

## Future Work

- [ ] Incremental training (update without full retrain)
- [ ] Multiple embedding models (DistMult, ComplEx, RotatE)
- [ ] Temporal embeddings (time-aware)
- [ ] Graph neural networks (GCN, GAT)
- [ ] Cross-project transfer learning
- [ ] Federated training

## References

1. Bordes et al. (2013). "Translating Embeddings for Modeling Multi-relational Data". NeurIPS.
2. Wang et al. (2017). "Knowledge Graph Embedding: A Survey". IEEE TKDE.
3. Sun et al. (2019). "RotatE: Knowledge Graph Embedding by Relational Rotation". ICLR.

## Support

For issues or questions:
- Check logs: `structlog` provides detailed training/query logs
- Review training runs: Query `krl_training_runs` table
- Enable explanations: Set `include_explanation=True` in ranking
- File issue: Include training stats and error logs

---

**Version**: 0.2.0  
**Last Updated**: November 26, 2025

