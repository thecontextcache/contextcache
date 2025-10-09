"""
End-to-end integration tests
Tests complete workflows through multiple services
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from cc_core.services.ingest import IngestService
from cc_core.services.explain import ExplainService
from cc_core.services.export import ExportService


@pytest.fixture
def mock_storage():
    """Mock storage adapter for e2e tests"""
    storage = AsyncMock()
    storage.create_document = AsyncMock(return_value=uuid4())
    storage.update_document_status = AsyncMock(return_value=True)
    storage.find_document_by_hash = AsyncMock(return_value=None)
    storage.create_chunk = AsyncMock(return_value=uuid4())
    storage.update_document = AsyncMock(return_value=True)
    storage.search_chunks = AsyncMock(return_value=[])
    storage.get_project = AsyncMock()
    storage.list_documents = AsyncMock(return_value=[])
    storage.list_chunks = AsyncMock(return_value=[])
    return storage


@pytest.mark.asyncio
async def test_complete_document_workflow(mock_storage):
    """
    Test complete workflow: ingest → query → explain → export
    """
    project_id = uuid4()
    
    # Step 1: Ingest a document
    ingest_service = IngestService(mock_storage)
    
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=(
            "Marie Curie discovered radium. She won two Nobel Prizes in Physics and Chemistry.",
            "Marie Curie"
        )
    ):
        ingest_result = await ingest_service.ingest_url(
            project_id=project_id,
            url="https://example.com/marie-curie",
            metadata={"topic": "science"}
        )
    
    assert ingest_result["status"] == "success"
    document_id = ingest_result["document_id"]
    
    # Step 2: Simulate search results
    mock_search_results = [
        {
            "chunk_id": uuid4(),
            "document_id": document_id,
            "text": "Marie Curie discovered radium",
            "similarity": 0.92,
            "source_url": "https://example.com/marie-curie"
        }
    ]
    mock_storage.search_chunks.return_value = mock_search_results
    
    # Step 3: Explain the query
    explain_service = ExplainService(mock_storage)
    explain_result = await explain_service.explain_query(
        project_id=project_id,
        query="Who discovered radium?",
        limit=10
    )
    
    assert explain_result["query"] == "Who discovered radium?"
    assert explain_result["results_count"] == 1
    
    # Step 4: Export the results
    export_service = ExportService(mock_storage)
    
    # Mock project data for export
    mock_project = MagicMock()
    mock_project.id = project_id
    mock_project.name = "Science Project"
    mock_project.created_at = MagicMock()
    mock_project.updated_at = MagicMock()
    mock_storage.get_project.return_value = mock_project
    
    export_result = await export_service.export_search_results(
        project_id=project_id,
        query="Who discovered radium?",
        results=mock_search_results,
        format="json"
    )
    
    assert export_result["status"] == "success"
    assert export_result["data"]["query"] == "Who discovered radium?"


@pytest.mark.asyncio
async def test_multi_document_workflow(mock_storage):
    """
    Test workflow with multiple documents
    """
    project_id = uuid4()
    ingest_service = IngestService(mock_storage)
    
    # Ingest multiple documents
    documents = [
        ("https://example.com/einstein", "Einstein developed relativity theory"),
        ("https://example.com/curie", "Curie discovered radioactive elements"),
        ("https://example.com/newton", "Newton formulated laws of motion")
    ]
    
    ingested_ids = []
    for url, text in documents:
        with patch.object(
            ingest_service.doc_service,
            'fetch_url_content',
            return_value=(text, "Science")
        ):
            result = await ingest_service.ingest_url(project_id, url)
            assert result["status"] == "success"
            ingested_ids.append(result["document_id"])
    
    assert len(ingested_ids) == 3
    
    # Verify all documents were processed
    assert mock_storage.create_document.call_count == 3


@pytest.mark.asyncio
async def test_duplicate_handling_workflow(mock_storage):
    """
    Test workflow with duplicate document detection
    """
    project_id = uuid4()
    url = "https://example.com/article"
    content = "This is a unique article about quantum physics."
    
    ingest_service = IngestService(mock_storage)
    
    # First ingestion - should succeed
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=(content, "Physics")
    ):
        result1 = await ingest_service.ingest_url(project_id, url)
    
    assert result1["status"] == "success"
    doc_id = result1["document_id"]
    
    # Second ingestion - should detect duplicate
    mock_existing_doc = MagicMock()
    mock_existing_doc.id = doc_id
    mock_storage.find_document_by_hash.return_value = mock_existing_doc
    
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=(content, "Physics")
    ):
        result2 = await ingest_service.ingest_url(project_id, url)
    
    assert result2["status"] == "duplicate"
    assert result2["document_id"] == str(doc_id)


@pytest.mark.asyncio
async def test_error_recovery_workflow(mock_storage):
    """
    Test workflow with error handling and recovery
    """
    project_id = uuid4()
    ingest_service = IngestService(mock_storage)
    
    # Simulate network error during fetch
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        side_effect=Exception("Network timeout")
    ):
        result = await ingest_service.ingest_url(
            project_id,
            "https://example.com/unreachable"
        )
    
    assert result["status"] == "failed"
    assert result["stage"] == "fetch"
    assert "Network timeout" in result["error"]
    
    # Verify system is still functional after error
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Valid content", "Title")
    ):
        result2 = await ingest_service.ingest_url(
            project_id,
            "https://example.com/working"
        )
    
    assert result2["status"] == "success"


@pytest.mark.asyncio
async def test_query_explanation_workflow(mock_storage):
    """
    Test query explanation and comparison workflow
    """
    project_id = uuid4()
    explain_service = ExplainService(mock_storage)
    
    # Setup mock results
    results = [
        {
            "chunk_id": uuid4(),
            "document_id": uuid4(),
            "text": "Machine learning is a subset of AI",
            "similarity": 0.9,
            "source_url": "https://example.com/ml"
        },
        {
            "chunk_id": uuid4(),
            "document_id": uuid4(),
            "text": "Deep learning uses neural networks",
            "similarity": 0.75,
            "source_url": "https://example.com/dl"
        }
    ]
    
    # Explain first query
    mock_storage.search_chunks.return_value = results
    explain1 = await explain_service.explain_query(
        project_id,
        "What is machine learning?",
        limit=10
    )
    
    assert explain1["results_count"] == 2
    assert "ranking_explanation" in explain1
    
    # Compare with similar query
    mock_storage.search_chunks.side_effect = [results, results]
    comparison = await explain_service.compare_queries(
        project_id,
        "What is machine learning?",
        "What is artificial intelligence?"
    )
    
    assert "semantic_similarity" in comparison
    assert "recommendations" in comparison


@pytest.mark.asyncio
async def test_export_workflow_all_formats(mock_storage):
    """
    Test exporting in all supported formats
    """
    project_id = uuid4()
    export_service = ExportService(mock_storage)
    
    # Setup mock data
    mock_project = MagicMock()
    mock_project.id = project_id
    mock_project.name = "Export Test"
    mock_project.created_at = MagicMock()
    mock_project.updated_at = MagicMock()
    
    mock_doc = MagicMock()
    mock_doc.id = uuid4()
    mock_doc.project_id = project_id
    mock_doc.source_type = "url"
    mock_doc.source_url = "https://example.com"
    mock_doc.content_hash = "hash123"
    mock_doc.status = "completed"
    mock_doc.fact_count = 1
    mock_doc.created_at = MagicMock()
    mock_doc.processed_at = MagicMock()
    
    mock_chunk = MagicMock()
    mock_chunk.id = uuid4()
    mock_chunk.document_id = mock_doc.id
    mock_chunk.chunk_index = 0
    mock_chunk.text = "Test chunk"
    mock_chunk.embedding = [0.1] * 384
    mock_chunk.start_offset = 0
    mock_chunk.end_offset = 10
    mock_chunk.created_at = MagicMock()
    
    mock_storage.get_project.return_value = mock_project
    mock_storage.list_documents.return_value = [mock_doc]
    mock_storage.list_chunks.return_value = [mock_chunk]
    
    # Test all formats
    formats = ["json", "csv", "markdown"]
    
    for fmt in formats:
        result = await export_service.export_project(
            project_id,
            format=fmt
        )
        
        assert result["status"] == "success", f"Failed for format: {fmt}"
        assert result["format"] == fmt
        assert "data" in result


@pytest.mark.asyncio
async def test_validation_pipeline(mock_storage):
    """
    Test validation at each stage of the pipeline
    """
    project_id = uuid4()
    ingest_service = IngestService(mock_storage)
    
    # Test SSRF protection
    result = await ingest_service.ingest_url(project_id, "http://localhost/admin")
    assert result["status"] == "failed"
    assert result["stage"] == "validation"
    
    # Test file type validation
    result = await ingest_service.ingest_file(
        project_id,
        "malware.exe",
        b"fake content"
    )
    assert result["status"] == "failed"
    assert "supported" in result["error"].lower()
    
    # Test content quality validation
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("x", "Title")  # Too short
    ):
        result = await ingest_service.ingest_url(
            project_id,
            "https://example.com/short"
        )
    
    assert result["status"] == "failed"
    assert result["stage"] == "quality_check"


@pytest.mark.asyncio
async def test_concurrent_operations(mock_storage):
    """
    Test handling of concurrent operations
    """
    import asyncio
    
    project_id = uuid4()
    ingest_service = IngestService(mock_storage)
    explain_service = ExplainService(mock_storage)
    
    # Prepare test data
    mock_storage.search_chunks.return_value = []
    
    # Concurrent ingestions and queries
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Content", "Title")
    ):
        tasks = [
            ingest_service.ingest_url(project_id, f"https://example.com/{i}")
            for i in range(3)
        ] + [
            explain_service.explain_query(project_id, f"query {i}", limit=5)
            for i in range(2)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # All operations should complete
    assert len(results) == 5
    # No exceptions should be raised
    assert all(not isinstance(r, Exception) for r in results)
