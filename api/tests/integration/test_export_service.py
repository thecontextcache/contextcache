"""
Integration tests for Export Service
Tests data export in various formats
"""
import pytest
import json
import csv
from io import StringIO
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime

from cc_core.services.export import ExportService


@pytest.fixture
def mock_storage():
    """Mock storage adapter"""
    storage = AsyncMock()
    storage.get_project = AsyncMock()
    storage.list_documents = AsyncMock(return_value=[])
    storage.list_chunks = AsyncMock(return_value=[])
    storage.get_document = AsyncMock()
    storage.list_document_chunks = AsyncMock(return_value=[])
    return storage


@pytest.fixture
def export_service(mock_storage):
    """Create export service with mocked storage"""
    return ExportService(mock_storage)


def create_mock_project(project_id):
    """Helper to create mock project"""
    project = MagicMock()
    project.id = project_id
    project.name = "Test Project"
    project.created_at = datetime.utcnow()
    project.updated_at = datetime.utcnow()
    return project


def create_mock_document(doc_id, project_id):
    """Helper to create mock document"""
    doc = MagicMock()
    doc.id = doc_id
    doc.project_id = project_id
    doc.source_type = "url"
    doc.source_url = "https://example.com/doc"
    doc.content_hash = "abc123"
    doc.status = "completed"
    doc.fact_count = 5
    doc.created_at = datetime.utcnow()
    doc.processed_at = datetime.utcnow()
    return doc


def create_mock_chunk(chunk_id, doc_id, index, text):
    """Helper to create mock chunk"""
    chunk = MagicMock()
    chunk.id = chunk_id
    chunk.document_id = doc_id
    chunk.chunk_index = index
    chunk.text = text
    chunk.embedding = [0.1] * 384
    chunk.start_offset = index * 100
    chunk.end_offset = (index + 1) * 100
    chunk.created_at = datetime.utcnow()
    return chunk


@pytest.mark.asyncio
async def test_export_project_not_found(export_service, mock_storage):
    """Test export when project doesn't exist"""
    project_id = uuid4()
    mock_storage.get_project.return_value = None
    
    result = await export_service.export_project(project_id)
    
    assert result["status"] == "error"
    assert "not found" in result["error"].lower()


@pytest.mark.asyncio
async def test_export_project_json(export_service, mock_storage):
    """Test JSON export of project"""
    project_id = uuid4()
    doc_id = uuid4()
    
    # Mock data
    mock_project = create_mock_project(project_id)
    mock_docs = [create_mock_document(doc_id, project_id)]
    mock_chunks = [
        create_mock_chunk(uuid4(), doc_id, 0, "First chunk"),
        create_mock_chunk(uuid4(), doc_id, 1, "Second chunk")
    ]
    
    mock_storage.get_project.return_value = mock_project
    mock_storage.list_documents.return_value = mock_docs
    mock_storage.list_chunks.return_value = mock_chunks
    
    result = await export_service.export_project(
        project_id,
        format="json",
        include_embeddings=True,
        include_metadata=True
    )
    
    assert result["status"] == "success"
    assert result["format"] == "json"
    assert result["project_name"] == "Test Project"
    
    # Check statistics
    stats = result["statistics"]
    assert stats["documents"] == 1
    assert stats["chunks"] == 2
    assert stats["size_bytes"] > 0
    
    # Check data structure
    data = result["data"]
    assert "project" in data
    assert "documents" in data
    assert "chunks" in data
    assert len(data["documents"]) == 1
    assert len(data["chunks"]) == 2
    
    # Check embeddings included
    assert "embedding" in data["chunks"][0]


@pytest.mark.asyncio
async def test_export_project_json_no_embeddings(export_service, mock_storage):
    """Test JSON export without embeddings"""
    project_id = uuid4()
    doc_id = uuid4()
    
    mock_project = create_mock_project(project_id)
    mock_docs = [create_mock_document(doc_id, project_id)]
    mock_chunks = [create_mock_chunk(uuid4(), doc_id, 0, "Chunk text")]
    
    mock_storage.get_project.return_value = mock_project
    mock_storage.list_documents.return_value = mock_docs
    mock_storage.list_chunks.return_value = mock_chunks
    
    result = await export_service.export_project(
        project_id,
        format="json",
        include_embeddings=False
    )
    
    data = result["data"]
    assert "embedding" not in data["chunks"][0]


@pytest.mark.asyncio
async def test_export_project_csv(export_service, mock_storage):
    """Test CSV export of project"""
    project_id = uuid4()
    doc_id = uuid4()
    
    mock_project = create_mock_project(project_id)
    mock_docs = [create_mock_document(doc_id, project_id)]
    mock_chunks = [
        create_mock_chunk(uuid4(), doc_id, 0, "First chunk text"),
        create_mock_chunk(uuid4(), doc_id, 1, "Second chunk text")
    ]
    
    mock_storage.get_project.return_value = mock_project
    mock_storage.list_documents.return_value = mock_docs
    mock_storage.list_chunks.return_value = mock_chunks
    
    result = await export_service.export_project(project_id, format="csv")
    
    assert result["status"] == "success"
    assert result["format"] == "csv"
    
    # Parse CSV
    csv_data = result["data"]
    reader = csv.DictReader(StringIO(csv_data))
    rows = list(reader)
    
    assert len(rows) == 2
    assert "chunk_id" in rows[0]
    assert "text" in rows[0]
    assert rows[0]["text"] == "First chunk text"


@pytest.mark.asyncio
async def test_export_project_markdown(export_service, mock_storage):
    """Test Markdown export of project"""
    project_id = uuid4()
    doc_id = uuid4()
    
    mock_project = create_mock_project(project_id)
    mock_docs = [create_mock_document(doc_id, project_id)]
    mock_chunks = [
        create_mock_chunk(uuid4(), doc_id, 0, "First chunk"),
        create_mock_chunk(uuid4(), doc_id, 1, "Second chunk")
    ]
    
    mock_storage.get_project.return_value = mock_project
    mock_storage.list_documents.return_value = mock_docs
    mock_storage.list_chunks.return_value = mock_chunks
    
    result = await export_service.export_project(project_id, format="markdown")
    
    assert result["status"] == "success"
    assert result["format"] == "markdown"
    
    # Check markdown formatting
    md_data = result["data"]
    assert "# Test Project" in md_data
    assert "## https://example.com/doc" in md_data
    assert "### Chunk 0" in md_data
    assert "First chunk" in md_data
    assert "---" in md_data


@pytest.mark.asyncio
async def test_export_project_unsupported_format(export_service, mock_storage):
    """Test export with unsupported format"""
    project_id = uuid4()
    mock_storage.get_project.return_value = create_mock_project(project_id)
    
    result = await export_service.export_project(project_id, format="xml")
    
    assert result["status"] == "error"
    assert "unsupported" in result["error"].lower()


@pytest.mark.asyncio
async def test_export_document(export_service, mock_storage):
    """Test single document export"""
    doc_id = uuid4()
    
    mock_doc = create_mock_document(doc_id, uuid4())
    mock_chunks = [
        create_mock_chunk(uuid4(), doc_id, 0, "Chunk 1"),
        create_mock_chunk(uuid4(), doc_id, 1, "Chunk 2")
    ]
    
    mock_storage.get_document.return_value = mock_doc
    mock_storage.list_document_chunks.return_value = mock_chunks
    
    result = await export_service.export_document(doc_id, format="json")
    
    assert result["status"] == "success"
    assert result["chunks_count"] == 2
    
    data = result["data"]
    assert "document" in data
    assert "chunks" in data
    assert len(data["chunks"]) == 2


@pytest.mark.asyncio
async def test_export_document_not_found(export_service, mock_storage):
    """Test document export when document doesn't exist"""
    doc_id = uuid4()
    mock_storage.get_document.return_value = None
    
    result = await export_service.export_document(doc_id)
    
    assert result["status"] == "error"
    assert "not found" in result["error"].lower()


@pytest.mark.asyncio
async def test_export_document_markdown(export_service, mock_storage):
    """Test document export as Markdown"""
    doc_id = uuid4()
    
    mock_doc = create_mock_document(doc_id, uuid4())
    mock_chunks = [create_mock_chunk(uuid4(), doc_id, 0, "Test chunk")]
    
    mock_storage.get_document.return_value = mock_doc
    mock_storage.list_document_chunks.return_value = mock_chunks
    
    result = await export_service.export_document(doc_id, format="markdown")
    
    assert result["status"] == "success"
    
    md_data = result["data"]
    assert "# https://example.com/doc" in md_data
    assert "## Chunk 0" in md_data
    assert "Test chunk" in md_data


@pytest.mark.asyncio
async def test_export_search_results_json(export_service):
    """Test search results export as JSON"""
    project_id = uuid4()
    query = "test query"
    results = [
        {
            "chunk_id": str(uuid4()),
            "document_id": str(uuid4()),
            "text": "Result 1",
            "similarity": 0.9,
            "source_url": "https://example.com/1"
        },
        {
            "chunk_id": str(uuid4()),
            "document_id": str(uuid4()),
            "text": "Result 2",
            "similarity": 0.8,
            "source_url": "https://example.com/2"
        }
    ]
    
    result = await export_service.export_search_results(
        project_id,
        query,
        results,
        format="json"
    )
    
    assert result["status"] == "success"
    
    data = result["data"]
    assert data["query"] == query
    assert data["results_count"] == 2
    assert len(data["results"]) == 2


@pytest.mark.asyncio
async def test_export_search_results_csv(export_service):
    """Test search results export as CSV"""
    project_id = uuid4()
    query = "test query"
    results = [
        {
            "chunk_id": str(uuid4()),
            "document_id": str(uuid4()),
            "text": "Result text",
            "similarity": 0.9,
            "source_url": "https://example.com"
        }
    ]
    
    result = await export_service.export_search_results(
        project_id,
        query,
        results,
        format="csv"
    )
    
    assert result["status"] == "success"
    
    # Parse CSV
    csv_data = result["data"]
    reader = csv.DictReader(StringIO(csv_data))
    rows = list(reader)
    
    assert len(rows) == 1
    assert "rank" in rows[0]
    assert rows[0]["rank"] == "1"
    assert rows[0]["similarity"] == "0.9"


@pytest.mark.asyncio
async def test_export_search_results_markdown(export_service):
    """Test search results export as Markdown"""
    project_id = uuid4()
    query = "test query"
    results = [
        {
            "chunk_id": str(uuid4()),
            "text": "Result text",
            "similarity": 0.85,
            "source_url": "https://example.com"
        }
    ]
    
    result = await export_service.export_search_results(
        project_id,
        query,
        results,
        format="markdown"
    )
    
    assert result["status"] == "success"
    
    md_data = result["data"]
    assert "# Search Results" in md_data
    assert "**Query:** test query" in md_data
    assert "## Result 1" in md_data
    assert "**Similarity:** 0.85" in md_data


@pytest.mark.asyncio
async def test_export_empty_project(export_service, mock_storage):
    """Test exporting empty project"""
    project_id = uuid4()
    
    mock_project = create_mock_project(project_id)
    mock_storage.get_project.return_value = mock_project
    mock_storage.list_documents.return_value = []
    mock_storage.list_chunks.return_value = []
    
    result = await export_service.export_project(project_id, format="json")
    
    assert result["status"] == "success"
    
    stats = result["statistics"]
    assert stats["documents"] == 0
    assert stats["chunks"] == 0


@pytest.mark.asyncio
async def test_export_preserves_data_integrity(export_service, mock_storage):
    """Test that export preserves all data correctly"""
    project_id = uuid4()
    doc_id = uuid4()
    chunk_id = uuid4()
    
    specific_text = "This is very specific text that must be preserved exactly"
    
    mock_project = create_mock_project(project_id)
    mock_docs = [create_mock_document(doc_id, project_id)]
    mock_chunks = [create_mock_chunk(chunk_id, doc_id, 0, specific_text)]
    
    mock_storage.get_project.return_value = mock_project
    mock_storage.list_documents.return_value = mock_docs
    mock_storage.list_chunks.return_value = mock_chunks
    
    result = await export_service.export_project(project_id, format="json")
    
    # Verify exact text preservation
    exported_text = result["data"]["chunks"][0]["text"]
    assert exported_text == specific_text
    assert len(exported_text) == len(specific_text)
