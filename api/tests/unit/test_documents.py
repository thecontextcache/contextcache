"""
Test document upload and processing
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select
from cc_core.storage.database import Base
from cc_core.models.project import ProjectDB
from cc_core.models.document import DocumentDB, DocumentStatus
from cc_core.models.chunk import DocumentChunkDB
from cc_core.services.document_service import DocumentService
from cc_core.services.embedding_service import EmbeddingService
import os
import uuid


# Test database URL
TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL", 
    "postgresql+asyncpg://postgres:postgres@localhost:5432/contextcache_test"
)


@pytest.fixture(scope="function")
async def db_session():
    """Create a test database session"""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with async_session() as session:
        yield session
        await session.rollback()
    
    # Drop tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def test_project(db_session: AsyncSession):
    """Create a test project"""
    project = ProjectDB(name="Test Project", salt=b"salt123456789012")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project


@pytest.mark.asyncio
async def test_create_document(db_session: AsyncSession, test_project):
    """Test creating a document"""
    document = DocumentDB(
        project_id=test_project.id,
        source_type="url",
        source_url="https://example.com/test.txt",
        content_hash="abc123",
        status=DocumentStatus.pending.value
    )
    
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    
    assert document.id is not None
    assert document.project_id == test_project.id
    assert document.source_type == "url"
    assert document.status == DocumentStatus.pending.value


@pytest.mark.asyncio
async def test_document_status_transitions(db_session: AsyncSession, test_project):
    """Test document status transitions"""
    document = DocumentDB(
        project_id=test_project.id,
        source_type="file",
        source_url="test.pdf",
        content_hash="hash123",
        status=DocumentStatus.pending.value
    )
    
    db_session.add(document)
    await db_session.commit()
    
    # Transition to processing
    document.status = DocumentStatus.processing.value
    await db_session.commit()
    assert document.status == DocumentStatus.processing.value
    
    # Transition to completed
    document.status = DocumentStatus.completed.value
    await db_session.commit()
    assert document.status == DocumentStatus.completed.value


@pytest.mark.asyncio
async def test_document_chunks(db_session: AsyncSession, test_project):
    """Test creating document chunks"""
    # Create document
    document = DocumentDB(
        project_id=test_project.id,
        source_type="text",
        source_url="inline",
        content_hash="hash456",
        status=DocumentStatus.processing.value
    )
    
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    
    # Create chunks
    chunks = [
        DocumentChunkDB(
            document_id=document.id,
            chunk_index=i,
            text=f"This is chunk {i}",
            embedding=[0.1] * 384,  # Mock embedding
            start_offset=i * 100,
            end_offset=(i + 1) * 100
        )
        for i in range(3)
    ]
    
    for chunk in chunks:
        db_session.add(chunk)
    
    await db_session.commit()
    
    # Verify chunks
    result = await db_session.execute(
        select(DocumentChunkDB)
        .where(DocumentChunkDB.document_id == document.id)
        .order_by(DocumentChunkDB.chunk_index)
    )
    saved_chunks = result.scalars().all()
    
    assert len(saved_chunks) == 3
    assert saved_chunks[0].text == "This is chunk 0"
    assert saved_chunks[1].chunk_index == 1


@pytest.mark.asyncio
async def test_document_service_chunking():
    """Test document service text chunking"""
    service = DocumentService()
    
    text = "This is a test document. " * 100  # Long text
    chunks = service.chunk_text(text, chunk_size=100, overlap=20)
    
    assert len(chunks) > 0
    assert all("chunk_id" in c for c in chunks)
    assert all("text" in c for c in chunks)
    assert all("start_offset" in c for c in chunks)
    assert all("end_offset" in c for c in chunks)


@pytest.mark.asyncio
async def test_document_service_hash():
    """Test document content hashing"""
    service = DocumentService()
    
    text1 = "Hello, World!"
    text2 = "Hello, World!"
    text3 = "Goodbye, World!"
    
    hash1 = service.compute_content_hash(text1)
    hash2 = service.compute_content_hash(text2)
    hash3 = service.compute_content_hash(text3)
    
    assert hash1 == hash2  # Same content
    assert hash1 != hash3  # Different content
    assert len(hash1) == 64  # SHA256 hex


@pytest.mark.asyncio
async def test_embedding_service():
    """Test embedding service"""
    service = EmbeddingService()
    
    # Single embedding
    text = "This is a test sentence."
    embedding = service.embed_text(text)
    
    assert len(embedding) == 384  # MiniLM dimension
    assert all(isinstance(x, float) for x in embedding)
    
    # Batch embeddings
    texts = ["First sentence.", "Second sentence.", "Third sentence."]
    embeddings = service.embed_batch(texts)
    
    assert len(embeddings) == 3
    assert all(len(e) == 384 for e in embeddings)


@pytest.mark.asyncio
async def test_duplicate_detection(db_session: AsyncSession, test_project):
    """Test duplicate document detection"""
    content_hash = "unique_hash_123"
    
    # Create first document
    doc1 = DocumentDB(
        project_id=test_project.id,
        source_type="url",
        source_url="https://example.com/doc1.txt",
        content_hash=content_hash,
        status=DocumentStatus.completed.value
    )
    
    db_session.add(doc1)
    await db_session.commit()
    
    # Try to create duplicate
    result = await db_session.execute(
        select(DocumentDB).where(
            DocumentDB.project_id == test_project.id,
            DocumentDB.content_hash == content_hash
        )
    )
    existing = result.scalar_one_or_none()
    
    assert existing is not None
    assert existing.id == doc1.id


@pytest.mark.asyncio
async def test_document_fact_count(db_session: AsyncSession, test_project):
    """Test document fact count tracking"""
    document = DocumentDB(
        project_id=test_project.id,
        source_type="text",
        source_url="test",
        content_hash="hash789",
        status=DocumentStatus.completed.value,
        fact_count=5
    )
    
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)
    
    assert document.fact_count == 5


@pytest.mark.asyncio
async def test_list_documents_by_project(db_session: AsyncSession, test_project):
    """Test listing documents for a project"""
    # Create multiple documents
    for i in range(3):
        doc = DocumentDB(
            project_id=test_project.id,
            source_type="url",
            source_url=f"https://example.com/doc{i}.txt",
            content_hash=f"hash_{i}",
            status=DocumentStatus.completed.value
        )
        db_session.add(doc)
    
    await db_session.commit()
    
    # List documents
    result = await db_session.execute(
        select(DocumentDB)
        .where(DocumentDB.project_id == test_project.id)
        .order_by(DocumentDB.created_at.desc())
    )
    documents = result.scalars().all()
    
    assert len(documents) == 3
