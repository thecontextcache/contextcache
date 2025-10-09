"""
Integration tests for Explain Service
Tests query explanation and retrieval insights
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from cc_core.services.explain import ExplainService


@pytest.fixture
def mock_storage():
    """Mock storage adapter"""
    storage = AsyncMock()
    storage.search_chunks = AsyncMock(return_value=[])
    storage.get_chunk = AsyncMock()
    storage.get_document = AsyncMock()
    storage.get_fact_scores = AsyncMock()
    return storage


@pytest.fixture
def explain_service(mock_storage):
    """Create explain service with mocked storage"""
    return ExplainService(mock_storage)


@pytest.mark.asyncio
async def test_explain_query_no_results(explain_service, mock_storage):
    """Test query explanation when no results found"""
    project_id = uuid4()
    query = "quantum physics"
    
    # Mock no results
    mock_storage.search_chunks.return_value = []
    
    result = await explain_service.explain_query(project_id, query, limit=10)
    
    assert result["status"] == "no_results"
    assert result["query"] == query
    assert "timing" in result


@pytest.mark.asyncio
async def test_explain_query_with_results(explain_service, mock_storage):
    """Test query explanation with actual results"""
    project_id = uuid4()
    query = "Marie Curie discoveries"
    
    # Mock search results
    mock_results = [
        {
            "chunk_id": uuid4(),
            "document_id": uuid4(),
            "text": "Marie Curie discovered radium and polonium",
            "similarity": 0.95,
            "source_url": "https://example.com/curie"
        },
        {
            "chunk_id": uuid4(),
            "document_id": uuid4(),
            "text": "Marie Curie won two Nobel Prizes",
            "similarity": 0.87,
            "source_url": "https://example.com/nobel"
        },
        {
            "chunk_id": uuid4(),
            "document_id": uuid4(),
            "text": "Marie Curie was a physicist and chemist",
            "similarity": 0.72,
            "source_url": "https://example.com/bio"
        }
    ]
    mock_storage.search_chunks.return_value = mock_results
    
    result = await explain_service.explain_query(project_id, query, limit=3)
    
    assert result["query"] == query
    assert result["results_count"] == 3
    assert "ranking_explanation" in result
    assert "diversity_metrics" in result
    assert "query_analysis" in result
    assert "timing" in result
    
    # Check ranking explanation
    ranking = result["ranking_explanation"]
    assert ranking["algorithm"] == "cosine_similarity"
    assert "score_range" in ranking
    assert ranking["score_range"]["highest"] == 0.95
    assert ranking["score_range"]["lowest"] == 0.72
    
    # Check diversity metrics
    diversity = result["diversity_metrics"]
    assert "score" in diversity
    assert diversity["unique_documents"] == 3
    
    # Check results
    assert len(result["results"]) == 3
    assert result["results"][0]["rank"] == 1
    assert result["results"][0]["similarity_score"] == 0.95


@pytest.mark.asyncio
async def test_explain_query_diversity_calculation(explain_service, mock_storage):
    """Test diversity calculation for results"""
    project_id = uuid4()
    query = "test query"
    
    # Mock results from same document (low diversity)
    same_doc_id = uuid4()
    mock_results = [
        {
            "chunk_id": uuid4(),
            "document_id": same_doc_id,
            "text": "Text chunk 1",
            "similarity": 0.9,
            "source_url": "https://example.com/doc"
        },
        {
            "chunk_id": uuid4(),
            "document_id": same_doc_id,
            "text": "Text chunk 2",
            "similarity": 0.8,
            "source_url": "https://example.com/doc"
        }
    ]
    mock_storage.search_chunks.return_value = mock_results
    
    result = await explain_service.explain_query(project_id, query, limit=2)
    
    diversity = result["diversity_metrics"]
    assert diversity["unique_documents"] == 1
    assert diversity["score"] == 0.5  # 1 unique doc / 2 results
    assert "low diversity" in diversity["description"].lower()


@pytest.mark.asyncio
async def test_explain_chunk(explain_service, mock_storage):
    """Test chunk explanation"""
    chunk_id = uuid4()
    project_id = uuid4()
    document_id = uuid4()
    
    # Mock chunk
    mock_chunk = MagicMock()
    mock_chunk.id = chunk_id
    mock_chunk.document_id = document_id
    mock_chunk.chunk_index = 5
    mock_chunk.text = "Sample chunk text"
    mock_chunk.start_offset = 0
    mock_chunk.end_offset = 17
    mock_chunk.embedding = [0.1] * 384
    mock_chunk.created_at = MagicMock()
    
    # Mock document
    mock_document = MagicMock()
    mock_document.source_type = "url"
    mock_document.source_url = "https://example.com/doc"
    mock_document.created_at = MagicMock()
    
    # Mock fact scores
    mock_scores = {"rank_score": 0.75, "decay_factor": 0.9}
    
    mock_storage.get_chunk.return_value = mock_chunk
    mock_storage.get_document.return_value = mock_document
    mock_storage.get_fact_scores.return_value = mock_scores
    
    result = await explain_service.explain_chunk(chunk_id, project_id)
    
    assert result["chunk_id"] == str(chunk_id)
    assert result["document_id"] == str(document_id)
    assert result["chunk_index"] == 5
    assert "content" in result
    assert "document_info" in result
    assert "embedding_analysis" in result
    assert "ranking_scores" in result
    
    # Check ranking scores
    scores = result["ranking_scores"]
    assert scores["pagerank_score"] == 0.75
    assert scores["decay_factor"] == 0.9
    assert scores["final_score"] == 0.75 * 0.9


@pytest.mark.asyncio
async def test_explain_chunk_not_found(explain_service, mock_storage):
    """Test chunk explanation when chunk doesn't exist"""
    chunk_id = uuid4()
    project_id = uuid4()
    
    mock_storage.get_chunk.return_value = None
    
    result = await explain_service.explain_chunk(chunk_id, project_id)
    
    assert result["status"] == "not_found"
    assert "error" in result


@pytest.mark.asyncio
async def test_compare_queries(explain_service, mock_storage):
    """Test query comparison functionality"""
    project_id = uuid4()
    query1 = "machine learning algorithms"
    query2 = "deep learning neural networks"
    
    # Mock results for both queries
    results1 = [
        {"chunk_id": uuid4(), "document_id": uuid4(), "text": "ML text", "similarity": 0.9}
    ]
    results2 = [
        {"chunk_id": uuid4(), "document_id": uuid4(), "text": "DL text", "similarity": 0.85}
    ]
    
    mock_storage.search_chunks.side_effect = [results1, results2]
    
    result = await explain_service.compare_queries(project_id, query1, query2)
    
    assert result["query1"] == query1
    assert result["query2"] == query2
    assert "semantic_similarity" in result
    assert "results_comparison" in result
    assert "recommendations" in result
    
    # Check semantic similarity
    similarity = result["semantic_similarity"]
    assert "score" in similarity
    assert "interpretation" in similarity
    
    # Check results comparison
    comparison = result["results_comparison"]
    assert comparison["query1_results"] == 1
    assert comparison["query2_results"] == 1


@pytest.mark.asyncio
async def test_compare_queries_with_overlap(explain_service, mock_storage):
    """Test query comparison with overlapping results"""
    project_id = uuid4()
    query1 = "python programming"
    query2 = "python coding"
    
    # Use same chunk IDs for overlap
    shared_chunk_id = uuid4()
    results1 = [
        {"chunk_id": shared_chunk_id, "document_id": uuid4(), "text": "Python", "similarity": 0.9},
        {"chunk_id": uuid4(), "document_id": uuid4(), "text": "Code", "similarity": 0.8}
    ]
    results2 = [
        {"chunk_id": shared_chunk_id, "document_id": uuid4(), "text": "Python", "similarity": 0.95}
    ]
    
    mock_storage.search_chunks.side_effect = [results1, results2]
    
    result = await explain_service.compare_queries(project_id, query1, query2)
    
    comparison = result["results_comparison"]
    assert comparison["overlap"] == 1
    assert comparison["overlap_percentage"] == 50.0  # 1 overlap / 2 results


@pytest.mark.asyncio
async def test_explain_query_timing(explain_service, mock_storage):
    """Test that timing information is accurate"""
    project_id = uuid4()
    query = "test query"
    
    mock_storage.search_chunks.return_value = []
    
    result = await explain_service.explain_query(project_id, query)
    
    timing = result["timing"]
    assert "embedding" in timing
    assert "retrieval" in timing
    assert "total" in timing
    
    # Timing should be string with units
    assert timing["embedding"].endswith("s")
    assert timing["retrieval"].endswith("s")
    assert timing["total"].endswith("s")


@pytest.mark.asyncio
async def test_explain_query_analysis(explain_service, mock_storage):
    """Test query analysis section"""
    project_id = uuid4()
    query = "What is machine learning and how does it work?"
    
    mock_storage.search_chunks.return_value = []
    
    result = await explain_service.explain_query(project_id, query)
    
    analysis = result["query_analysis"]
    assert analysis["length"] == len(query)
    assert analysis["tokens"] == len(query.split())
    assert analysis["embedding_dimension"] == 384


@pytest.mark.asyncio
async def test_embedding_analysis(explain_service):
    """Test embedding analysis functionality"""
    # Create sample embedding
    embedding = [0.1] * 384
    
    stats = explain_service._analyze_embedding(embedding)
    
    assert stats["dimension"] == 384
    assert "statistics" in stats
    assert "mean" in stats["statistics"]
    assert "std_dev" in stats["statistics"]
    assert "l2_norm" in stats["statistics"]
    assert "description" in stats


@pytest.mark.asyncio
async def test_result_explanation_messages(explain_service, mock_storage):
    """Test that result explanations are appropriate for similarity scores"""
    project_id = uuid4()
    query = "test"
    
    # Mock results with different similarity scores
    mock_results = [
        {"chunk_id": uuid4(), "document_id": uuid4(), "text": "Very relevant", "similarity": 0.95, "source_url": "url1"},
        {"chunk_id": uuid4(), "document_id": uuid4(), "text": "Somewhat relevant", "similarity": 0.65, "source_url": "url2"},
        {"chunk_id": uuid4(), "document_id": uuid4(), "text": "Barely relevant", "similarity": 0.35, "source_url": "url3"}
    ]
    mock_storage.search_chunks.return_value = mock_results
    
    result = await explain_service.explain_query(project_id, query, limit=3)
    
    # Check explanations
    assert "Very strong" in result["results"][0]["explanation"] or "strong" in result["results"][0]["explanation"]
    assert "Good" in result["results"][1]["explanation"] or "Moderate" in result["results"][1]["explanation"]
    assert "Weak" in result["results"][2]["explanation"]
