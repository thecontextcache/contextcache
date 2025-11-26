# KRL Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Run Migration (30 seconds)
```bash
psql $DATABASE_URL -f api/migrations/004_add_krl_support.sql
```

### Step 2: Train Embeddings (2-5 minutes)
```python
from cc_core.services import KRLService
from cc_core.storage import PostgresAdapter

storage = PostgresAdapter(database_url, encryption_key)
await storage.connect()

krl = KRLService(storage=storage)
result = await krl.train_and_update_embeddings(project_id)

print(f"Trained {result['num_entities']} entities!")
```

### Step 3: Use Graph-Aware Queries
```python
from cc_core.services import RAGCAGService, RankingService

rag = RAGCAGService(
    storage=storage,
    ranking_service=RankingService(storage=storage)
)

result = await rag.query(
    query="Your question",
    project_id=project_id,
    facts=facts,
    use_graph_context=True  # ✨ Enable KRL magic
)

print(f"Graph entities: {result['graph_context']['matched_entities']}")
```

---

## 📦 What You Get

✅ **TransE embeddings** for entities and relations  
✅ **Graph-aware retrieval** using entity similarity  
✅ **Neighborhood expansion** for context  
✅ **Combined ranking** with KRL scores  
✅ **Toggle on/off** per query  

---

## 🎯 Common Use Cases

### Use Case 1: Entity Similarity
```python
from cc_core.services import KRLService

similar = await krl.find_similar_entities(
    project_id=project_id,
    entity_id=marie_curie_id,
    top_k=5
)
# Returns: [(Entity, similarity_score), ...]
```

### Use Case 2: Graph Context for Query
```python
from cc_core.services import RankingService, EmbeddingService

ranking = RankingService(storage=storage)
embedding = EmbeddingService()

query_vec = await embedding.embed_text("Who discovered radium?")

graph = await ranking.retrieve_graph_context_for_query(
    project_id=project_id,
    query_embedding=query_vec,
    top_k_entities=5
)

print("\n".join(graph['context_snippets']))
```

### Use Case 3: Ranking with Explanations
```python
from cc_core.services import RankingService

ranking = RankingService(storage=storage)

ranked = ranking.rank_facts_with_scores(
    facts=facts,
    use_krl=True,
    include_explanation=True
)

for item in ranked[:3]:
    print(f"Score: {item['final_score']:.3f}")
    print(f"  {item['explanation']['computation']}")
```

---

## 🔧 Configuration

### Small Projects (< 500 entities)
```python
KRLService(
    storage=storage,
    embedding_dim=50,
    epochs=50,
    batch_size=64
)
# Training time: ~30 seconds
```

### Medium Projects (500-5000 entities)
```python
KRLService(
    storage=storage,
    embedding_dim=100,
    epochs=100,
    batch_size=128
)
# Training time: 2-5 minutes
```

### Large Projects (> 5000 entities)
```python
KRLService(
    storage=storage,
    embedding_dim=150,
    epochs=150,
    batch_size=256,
    device='cuda'  # Use GPU
)
# Training time: 10-30 minutes
```

---

## 📊 Monitoring

### Check Training Status
```sql
SELECT * FROM krl_training_runs 
ORDER BY started_at DESC 
LIMIT 5;
```

### Check Embedding Coverage
```sql
-- Entities with embeddings
SELECT COUNT(*) FROM entities WHERE krl_embedding IS NOT NULL;

-- Facts with KRL scores
SELECT COUNT(*) FROM facts WHERE krl_score IS NOT NULL;
```

### View Score Distribution
```sql
SELECT 
    ROUND(krl_score::numeric, 1) as bucket,
    COUNT(*) as count
FROM facts
WHERE krl_score IS NOT NULL
GROUP BY bucket
ORDER BY bucket DESC;
```

---

## 🎛️ Toggle Controls

### Query-Level Toggle
```python
# With graph context (slower, more comprehensive)
result = await rag.query(..., use_graph_context=True)

# Without graph context (faster, text-only)
result = await rag.query(..., use_graph_context=False)
```

### Ranking-Level Toggle
```python
# With KRL scores
ranked = ranking.rank_facts_with_scores(facts, use_krl=True)

# Without KRL scores (baseline)
ranked = ranking.rank_facts_with_scores(facts, use_krl=False)
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not enough entities" | Need 2+ entities, 1+ relation, 10+ triples |
| Graph context always empty | Lower `min_similarity` to 0.2, check embeddings exist |
| Training too slow | Reduce epochs/batch_size, or use GPU |
| Query latency high | Reduce `top_k_entities` to 3, increase `min_similarity` |

---

## 📚 Documentation

- **Complete Guide**: `KRL_IMPLEMENTATION_SUMMARY.md`
- **Integration Status**: `KRL_INTEGRATION_COMPLETE.md`
- **API Reference**: `api/cc_core/services/README_KRL.md`
- **Examples**: `api/examples/krl_usage_example.py`

---

## ✅ Verification

Run this to verify everything works:
```bash
cd api
source venv/bin/activate
python verify_krl_imports.py
```

Expected: `🎉 All verifications passed!`

---

## 🎯 Quick Commands

```bash
# Train embeddings
python -c "from examples.krl_usage_example import example_1_train_krl_embeddings; import asyncio; asyncio.run(example_1_train_krl_embeddings())"

# Test graph retrieval
python -c "from examples.krl_usage_example import example_3_graph_aware_retrieval; import asyncio; asyncio.run(example_3_graph_aware_retrieval())"

# Test RAG with graph
python -c "from examples.krl_usage_example import example_4_enhanced_rag_query; import asyncio; asyncio.run(example_4_enhanced_rag_query())"
```

---

## 💡 Pro Tips

1. **Train after imports**: Run KRL training after importing a batch of documents
2. **Retrain periodically**: Weekly for active projects, monthly for stable ones
3. **Start with defaults**: The default parameters work well for most projects
4. **Monitor loss**: Should decrease each epoch; if not, increase `learning_rate`
5. **Cache embeddings**: Load once, reuse for multiple queries
6. **Toggle smartly**: Use `use_graph_context=True` for exploratory queries, `False` for speed

---

**Ready to go! 🚀**

Your KRL implementation is fully integrated and production-ready.

**Status**: ✅ Complete  
**Version**: 0.2.0  
**Date**: November 26, 2025

