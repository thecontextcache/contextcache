"""
Integration tests for Ingest Service
Tests the complete document ingestion pipeline
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from cc_core.services.ingest import IngestService
from cc_core.models.document import DocumentDB, DocumentStatus


@pytest.fixture
def mock_storage():
    """Mock storage adapter"""
    storage = AsyncMock()
    storage.create_document = AsyncMock(return_value=uuid4())
    storage.update_document_status = AsyncMock(return_value=True)
    storage.find_document_by_hash = AsyncMock(return_value=None)
    storage.create_chunk = AsyncMock(return_value=uuid4())
    storage.update_document = AsyncMock(return_value=True)
    return storage


@pytest.fixture
def ingest_service(mock_storage):
    """Create ingest service with mocked storage"""
    return IngestService(mock_storage)


@pytest.mark.asyncio
async def test_ingest_url_success(ingest_service, mock_storage):
    """Test successful URL ingestion"""
    project_id = uuid4()
    url = "https://example.com/article.html"
    
    # Mock URL fetching
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Sample article text content.", "Sample Article")
    ):
        result = await ingest_service.ingest_url(
            project_id=project_id,
            url=url,
            metadata={"source": "test"}
        )
    
    assert result["status"] == "success"
    assert "document_id" in result
    assert result["stage"] == "completed"
    assert result["chunks_created"] > 0
    
    # Verify storage calls
    mock_storage.create_document.assert_called_once()
    mock_storage.create_chunk.assert_called()


@pytest.mark.asyncio
async def test_ingest_url_validation_failures(ingest_service):
    """Test URL validation catches invalid URLs"""
    project_id = uuid4()
    
    # Test empty URL
    result = await ingest_service.ingest_url(project_id, "")
    assert result["status"] == "failed"
    assert result["stage"] == "validation"
    
    # Test invalid protocol
    result = await ingest_service.ingest_url(project_id, "ftp://example.com")
    assert result["status"] == "failed"
    assert "http" in result["error"].lower()
    
    # Test localhost (SSRF protection)
    result = await ingest_service.ingest_url(project_id, "http://localhost/admin")
    assert result["status"] == "failed"
    assert "localhost" in result["error"].lower()
    
    # Test too long URL
    long_url = "https://example.com/" + "a" * 2000
    result = await ingest_service.ingest_url(project_id, long_url)
    assert result["status"] == "failed"


@pytest.mark.asyncio
async def test_ingest_url_duplicate_detection(ingest_service, mock_storage):
    """Test duplicate document detection"""
    project_id = uuid4()
    url = "https://example.com/article.html"
    existing_doc_id = uuid4()
    
    # Mock existing document
    mock_storage.find_document_by_hash.return_value = MagicMock(id=existing_doc_id)
    
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Sample text", "Title")
    ):
        result = await ingest_service.ingest_url(project_id, url)
    
    assert result["status"] == "duplicate"
    assert result["document_id"] == str(existing_doc_id)
    assert result["stage"] == "deduplication"


@pytest.mark.asyncio
async def test_ingest_file_pdf_success(ingest_service, mock_storage):
    """Test successful PDF file ingestion"""
    project_id = uuid4()
    filename = "research_paper.pdf"
    pdf_content = b"Mock PDF content"
    
    # Mock PDF extraction
    with patch.object(
        ingest_service.doc_service,
        'extract_text_from_pdf',
        return_value="Extracted PDF text content for testing."
    ):
        result = await ingest_service.ingest_file(
            project_id=project_id,
            filename=filename,
            content=pdf_content,
            metadata={"author": "Test Author"}
        )
    
    assert result["status"] == "success"
    assert result["stage"] == "completed"
    assert "document_id" in result


@pytest.mark.asyncio
async def test_ingest_file_txt_success(ingest_service, mock_storage):
    """Test successful text file ingestion"""
    project_id = uuid4()
    filename = "notes.txt"
    txt_content = b"Plain text file content for testing ingestion."
    
    result = await ingest_service.ingest_file(
        project_id=project_id,
        filename=filename,
        content=txt_content
    )
    
    assert result["status"] == "success"
    assert result["stage"] == "completed"


@pytest.mark.asyncio
async def test_ingest_file_validation_failures(ingest_service):
    """Test file validation catches errors"""
    project_id = uuid4()
    
    # Test empty content
    result = await ingest_service.ingest_file(project_id, "test.pdf", b"")
    assert result["status"] == "failed"
    assert "empty" in result["error"].lower()
    
    # Test unsupported file type
    result = await ingest_service.ingest_file(project_id, "test.docx", b"content")
    assert result["status"] == "failed"
    assert "supported" in result["error"].lower()
    
    # Test file too large
    large_content = b"x" * (51 * 1024 * 1024)  # 51MB
    result = await ingest_service.ingest_file(project_id, "large.pdf", large_content)
    assert result["status"] == "failed"
    assert "large" in result["error"].lower()


@pytest.mark.asyncio
async def test_ingest_content_quality_validation(ingest_service, mock_storage):
    """Test content quality validation"""
    project_id = uuid4()
    url = "https://example.com/short.html"
    
    # Test too short content
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Hi", "Title")
    ):
        result = await ingest_service.ingest_url(project_id, url)
    
    assert result["status"] == "failed"
    assert result["stage"] == "quality_check"
    assert "short" in result["error"].lower()


@pytest.mark.asyncio
async def test_ingest_chunking_and_embedding(ingest_service, mock_storage):
    """Test that chunking and embedding happen correctly"""
    project_id = uuid4()
    url = "https://example.com/article.html"
    
    # Create longer text to ensure multiple chunks
    long_text = "This is a test sentence. " * 100  # ~2500 chars
    
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=(long_text, "Long Article")
    ):
        result = await ingest_service.ingest_url(project_id, url)
    
    assert result["status"] == "success"
    assert result["chunks_created"] > 1  # Should have multiple chunks
    
    # Verify chunks were created
    assert mock_storage.create_chunk.call_count > 1


@pytest.mark.asyncio
async def test_ingest_error_handling(ingest_service, mock_storage):
    """Test error handling during processing"""
    project_id = uuid4()
    url = "https://example.com/article.html"
    
    # Mock storage error during chunk creation
    mock_storage.create_chunk.side_effect = Exception("Database error")
    
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Sample text", "Title")
    ):
        result = await ingest_service.ingest_url(project_id, url)
    
    assert result["status"] == "failed"
    assert result["stage"] == "processing"
    
    # Verify document status was updated to failed
    mock_storage.update_document_status.assert_called()


@pytest.mark.asyncio
async def test_ingest_metadata_preservation(ingest_service, mock_storage):
    """Test that metadata is preserved through ingestion"""
    project_id = uuid4()
    url = "https://example.com/article.html"
    metadata = {
        "author": "Test Author",
        "tags": ["test", "integration"],
        "custom_field": "custom_value"
    }
    
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Sample text", "Title")
    ):
        result = await ingest_service.ingest_url(project_id, url, metadata=metadata)
    
    assert result["status"] == "success"
    
    # Check that create_chunk was called with metadata
    chunk_calls = mock_storage.create_chunk.call_args_list
    for call in chunk_calls:
        kwargs = call[1]
        assert "metadata" in kwargs
        # Metadata should include custom fields
        assert kwargs["metadata"].get("custom_field") == "custom_value"


@pytest.mark.asyncio
async def test_ingest_concurrent_requests(ingest_service, mock_storage):
    """Test handling of concurrent ingestion requests"""
    import asyncio
    
    project_id = uuid4()
    urls = [
        "https://example.com/article1.html",
        "https://example.com/article2.html",
        "https://example.com/article3.html",
    ]
    
    with patch.object(
        ingest_service.doc_service,
        'fetch_url_content',
        return_value=("Sample text", "Title")
    ):
        # Run concurrent ingestions
        results = await asyncio.gather(
            *[ingest_service.ingest_url(project_id, url) for url in urls]
        )
    
    # All should succeed
    assert all(r["status"] == "success" for r in results)
    assert len(results) == 3


@pytest.mark.asyncio
async def test_ssrf_protection(ingest_service):
    """Test SSRF protection for various private/localhost URLs"""
    project_id = uuid4()
    
    dangerous_urls = [
        "http://localhost/admin",
        "http://127.0.0.1/internal",
        "http://0.0.0.0/secrets",
        "http://[::1]/private",
    ]
    
    for url in dangerous_urls:
        result = await ingest_service.ingest_url(project_id, url)
        assert result["status"] == "failed"
        assert result["stage"] == "validation"
        assert "localhost" in result["error"].lower() or "cannot" in result["error"].lower()
