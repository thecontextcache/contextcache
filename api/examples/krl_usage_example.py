"""
KRL Usage Examples

This file demonstrates how to use the new Knowledge Representation Learning (KRL)
features in ContextCache.

Features demonstrated:
1. Training KRL embeddings
2. Graph-aware retrieval
3. Entity similarity search
4. Enhanced RAG with graph context
"""
import asyncio
from uuid import UUID

from cc_core.services.krl_service import KRLService
from cc_core.services.ranking import RankingService
from cc_core.services.rag_cag_service import RAGCAGService
from cc_core.services.embedding_service import EmbeddingService
from cc_core.storage.adapters.postgres import PostgresAdapter


async def example_1_train_krl_embeddings():
    """
    Example 1: Train KRL embeddings for a project
    
    This should be run offline or as a background job.
    Typical execution time: 30-300 seconds depending on project size.
    """
    print("=" * 60)
    print("Example 1: Training KRL Embeddings")
    print("=" * 60)
    
    # Setup
    DATABASE_URL = "postgresql://user:pass@localhost/contextcache"
    ENCRYPTION_KEY = b"your-32-byte-encryption-key-here"
    
    storage = PostgresAdapter(DATABASE_URL, ENCRYPTION_KEY)
    await storage.connect()
    
    # Initialize KRL service
    krl_service = KRLService(
        storage=storage,
        embedding_dim=100,  # 50-200 typical
        epochs=100,         # More epochs = better quality, longer time
        batch_size=128,
        learning_rate=0.01,
        negative_samples=5
    )
    
    # Train embeddings for a project
    project_id = UUID("550e8400-e29b-41d4-a716-446655440000")
    
    print(f"\nTraining KRL embeddings for project {project_id}...")
    print("This may take a few minutes...\n")
    
    result = await krl_service.train_and_update_embeddings(project_id)
    
    # Print results
    print(f"Status: {result['status']}")
    print(f"Entities trained: {result.get('num_entities', 0)}")
    print(f"Relations trained: {result.get('num_relations', 0)}")
    print(f"Triples used: {result.get('num_triples', 0)}")
    print(f"Final loss: {result.get('final_loss', 0):.4f}")
    print(f"Duration: {result.get('training_duration_seconds', 0):.2f} seconds")
    print(f"\nEmbeddings saved to database:")
    print(f"  - {result.get('entities_updated', 0)} entities")
    print(f"  - {result.get('facts_scored', 0)} facts scored")
    
    await storage.disconnect()


async def example_2_entity_similarity_search():
    """
    Example 2: Find entities similar to a given entity
    
    Uses KRL embeddings to find structurally similar entities.
    """
    print("\n" + "=" * 60)
    print("Example 2: Entity Similarity Search")
    print("=" * 60)
    
    # Setup
    DATABASE_URL = "postgresql://user:pass@localhost/contextcache"
    ENCRYPTION_KEY = b"your-32-byte-encryption-key-here"
    
    storage = PostgresAdapter(DATABASE_URL, ENCRYPTION_KEY)
    await storage.connect()
    
    krl_service = KRLService(storage=storage)
    
    # Find similar entities
    project_id = UUID("550e8400-e29b-41d4-a716-446655440000")
    entity_id = UUID("660e8400-e29b-41d4-a716-446655440000")  # e.g., "Marie Curie"
    
    print(f"\nFinding entities similar to {entity_id}...\n")
    
    similar_entities = await krl_service.find_similar_entities(
        project_id=project_id,
        entity_id=entity_id,
        top_k=5
    )
    
    print(f"Found {len(similar_entities)} similar entities:")
    for i, (entity, similarity) in enumerate(similar_entities, 1):
        print(f"{i}. {entity.name} (type: {entity.entity_type})")
        print(f"   Similarity: {similarity:.3f}")
        print()
    
    await storage.disconnect()


async def example_3_graph_aware_retrieval():
    """
    Example 3: Graph-aware retrieval for a query
    
    Finds relevant entities and expands their neighborhood.
    """
    print("=" * 60)
    print("Example 3: Graph-Aware Retrieval")
    print("=" * 60)
    
    # Setup
    DATABASE_URL = "postgresql://user:pass@localhost/contextcache"
    ENCRYPTION_KEY = b"your-32-byte-encryption-key-here"
    
    storage = PostgresAdapter(DATABASE_URL, ENCRYPTION_KEY)
    await storage.connect()
    
    ranking_service = RankingService(storage=storage)
    embedding_service = EmbeddingService()
    
    # Query
    project_id = UUID("550e8400-e29b-41d4-a716-446655440000")
    query = "Who discovered radium?"
    
    print(f"\nQuery: {query}\n")
    
    # Embed query
    query_embedding = await embedding_service.embed_text(query)
    
    # Retrieve graph context
    graph_context = await ranking_service.retrieve_graph_context_for_query(
        project_id=project_id,
        query_embedding=query_embedding,
        top_k_entities=5,
        expand_depth=1,
        min_similarity=0.3
    )
    
    # Print results
    print("Graph Context Retrieved:")
    print(f"  Matched entities: {graph_context['metadata']['num_matched_entities']}")
    print(f"  Expanded entities: {graph_context['metadata']['num_expanded_entities']}")
    print(f"  Relations: {graph_context['metadata']['num_relations']}")
    print()
    
    print("Context Snippets:")
    for snippet in graph_context['context_snippets'][:10]:
        print(snippet)
    
    await storage.disconnect()


async def example_4_enhanced_rag_query():
    """
    Example 4: Enhanced RAG query with graph context
    
    Combines traditional RAG with graph-aware retrieval.
    """
    print("\n" + "=" * 60)
    print("Example 4: Enhanced RAG with Graph Context")
    print("=" * 60)
    
    # Setup
    DATABASE_URL = "postgresql://user:pass@localhost/contextcache"
    ENCRYPTION_KEY = b"your-32-byte-encryption-key-here"
    
    storage = PostgresAdapter(DATABASE_URL, ENCRYPTION_KEY)
    await storage.connect()
    
    # Initialize services
    embedding_service = EmbeddingService()
    ranking_service = RankingService(storage=storage)
    rag_service = RAGCAGService(
        embedding_service=embedding_service,
        storage=storage,
        ranking_service=ranking_service
    )
    
    # Query setup
    project_id = UUID("550e8400-e29b-41d4-a716-446655440000")
    query = "Tell me about Marie Curie's discoveries"
    
    # Load facts (in real usage, this would be from database)
    facts = await storage.list_facts(project_id=project_id, limit=1000)
    
    print(f"\nQuery: {query}")
    print(f"Facts available: {len(facts)}\n")
    
    # Perform enhanced query with graph context
    result = await rag_service.query(
        query=query,
        project_id=project_id,
        facts=facts,
        use_graph_context=True,  # Enable graph augmentation
        top_k=10
    )
    
    # Print results
    print(f"Total results: {result['count']}")
    print()
    
    print("RAG Metadata:")
    print(f"  Facts searched: {result['rag_metadata']['facts_searched']}")
    print(f"  Retrieval method: {result['rag_metadata']['retrieval_method']}")
    print()
    
    if result['graph_context']['enabled']:
        print("Graph Context:")
        print(f"  Matched entities: {result['graph_context']['matched_entities']}")
        print(f"  Expanded entities: {result['graph_context']['expanded_entities']}")
        print(f"  Relations: {result['graph_context']['relations']}")
        print()
        
        print("Graph Context Snippets:")
        for snippet in result['graph_context']['context_snippets'][:5]:
            print(f"  {snippet}")
    
    print("\nTop Results:")
    for i, item in enumerate(result['results'][:3], 1):
        if 'fact' in item:
            fact = item['fact']
            print(f"{i}. Fact: {fact.subject} {fact.predicate} {fact.object}")
            print(f"   Score: {item.get('personalized_score', 0):.3f}")
        print()
    
    await storage.disconnect()


async def example_5_ranking_with_krl_scores():
    """
    Example 5: Rank facts using combined scoring (including KRL)
    
    Shows how KRL scores are integrated into the ranking formula.
    """
    print("=" * 60)
    print("Example 5: Ranking with KRL Scores")
    print("=" * 60)
    
    # Setup
    DATABASE_URL = "postgresql://user:pass@localhost/contextcache"
    ENCRYPTION_KEY = b"your-32-byte-encryption-key-here"
    
    storage = PostgresAdapter(DATABASE_URL, ENCRYPTION_KEY)
    await storage.connect()
    
    ranking_service = RankingService(storage=storage)
    
    # Load facts
    project_id = UUID("550e8400-e29b-41d4-a716-446655440000")
    facts = await storage.list_facts(project_id=project_id, limit=100)
    
    print(f"\nRanking {len(facts)} facts...\n")
    
    # Rank with KRL scores and explanations
    ranked_facts = ranking_service.rank_facts_with_scores(
        facts=facts,
        use_krl=True,
        include_explanation=True
    )
    
    # Show top 5
    print("Top 5 Facts (with KRL scoring):")
    for i, item in enumerate(ranked_facts[:5], 1):
        fact = item['fact']
        print(f"\n{i}. {fact.subject} {fact.predicate} {fact.object}")
        print(f"   Final Score: {item['final_score']:.3f}")
        
        if 'explanation' in item:
            exp = item['explanation']
            print(f"   Breakdown:")
            print(f"     - PageRank: {exp['pagerank_score']:.3f}")
            print(f"     - Decay: {exp['decay_factor']:.3f}")
            print(f"     - Confidence: {exp['confidence']:.3f}")
            if exp.get('krl_score'):
                print(f"     - KRL Score: {exp['krl_score']:.3f}")
            print(f"   Computation: {exp['computation']}")
    
    # Compare with and without KRL
    print("\n" + "-" * 60)
    print("Comparison: With vs Without KRL")
    print("-" * 60)
    
    ranked_with_krl = ranking_service.rank_facts_with_scores(
        facts=facts[:10],
        use_krl=True
    )
    
    ranked_without_krl = ranking_service.rank_facts_with_scores(
        facts=facts[:10],
        use_krl=False
    )
    
    print("\nTop fact with KRL:")
    top_with = ranked_with_krl[0]
    print(f"  {top_with['fact'].subject} - Score: {top_with['final_score']:.3f}")
    
    print("\nTop fact without KRL:")
    top_without = ranked_without_krl[0]
    print(f"  {top_without['fact'].subject} - Score: {top_without['final_score']:.3f}")
    
    await storage.disconnect()


async def example_6_toggle_graph_context():
    """
    Example 6: Toggle graph context on/off
    
    Shows how to disable graph augmentation for faster queries.
    """
    print("\n" + "=" * 60)
    print("Example 6: Toggle Graph Context")
    print("=" * 60)
    
    # Setup
    DATABASE_URL = "postgresql://user:pass@localhost/contextcache"
    ENCRYPTION_KEY = b"your-32-byte-encryption-key-here"
    
    storage = PostgresAdapter(DATABASE_URL, ENCRYPTION_KEY)
    await storage.connect()
    
    embedding_service = EmbeddingService()
    ranking_service = RankingService(storage=storage)
    rag_service = RAGCAGService(
        embedding_service=embedding_service,
        storage=storage,
        ranking_service=ranking_service
    )
    
    project_id = UUID("550e8400-e29b-41d4-a716-446655440000")
    query = "What is radium?"
    facts = await storage.list_facts(project_id=project_id, limit=1000)
    
    print(f"\nQuery: {query}\n")
    
    # Query WITH graph context
    print("Querying WITH graph context...")
    import time
    start = time.time()
    
    result_with_graph = await rag_service.query(
        query=query,
        project_id=project_id,
        facts=facts,
        use_graph_context=True
    )
    
    time_with_graph = time.time() - start
    
    # Query WITHOUT graph context
    print("Querying WITHOUT graph context...")
    start = time.time()
    
    result_without_graph = await rag_service.query(
        query=query,
        project_id=project_id,
        facts=facts,
        use_graph_context=False
    )
    
    time_without_graph = time.time() - start
    
    # Compare
    print("\nComparison:")
    print(f"  With graph:    {time_with_graph:.3f}s, {result_with_graph['count']} results")
    print(f"  Without graph: {time_without_graph:.3f}s, {result_without_graph['count']} results")
    print(f"  Overhead:      {(time_with_graph - time_without_graph):.3f}s")
    print()
    print(f"Graph context enabled: {result_with_graph['graph_context']['enabled']}")
    if result_with_graph['graph_context']['enabled']:
        print(f"  - Matched entities: {result_with_graph['graph_context']['matched_entities']}")
        print(f"  - Relations: {result_with_graph['graph_context']['relations']}")
    
    await storage.disconnect()


async def main():
    """Run all examples"""
    print("\n" + "=" * 60)
    print("KRL USAGE EXAMPLES")
    print("=" * 60)
    print("\nThese examples demonstrate the new KRL features.")
    print("Make sure you've run the database migration first!")
    print()
    
    # Uncomment the examples you want to run
    
    # Example 1: Train KRL embeddings (run this first!)
    # await example_1_train_krl_embeddings()
    
    # Example 2: Entity similarity search
    # await example_2_entity_similarity_search()
    
    # Example 3: Graph-aware retrieval
    # await example_3_graph_aware_retrieval()
    
    # Example 4: Enhanced RAG query
    # await example_4_enhanced_rag_query()
    
    # Example 5: Ranking with KRL scores
    # await example_5_ranking_with_krl_scores()
    
    # Example 6: Toggle graph context
    # await example_6_toggle_graph_context()
    
    print("\n" + "=" * 60)
    print("Examples completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())

