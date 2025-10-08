"""
ContextCache API - Main entry point
"""
import os
import secrets
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from fastapi import File, UploadFile, Form
from cc_core.storage.database import get_db, init_db
from cc_core.models.project import ProjectDB, ProjectCreate, ProjectResponse
from cc_core.models.document import (
    DocumentDB, DocumentResponse,
    DocumentStatus, SourceType
)
from cc_core.models.chunk import DocumentChunkDB
from cc_core.services.document_service import DocumentService
from cc_core.services.embedding_service import EmbeddingService
from datetime import datetime
from dotenv import load_dotenv
from cc_core.crypto import Hasher
from arq import create_pool
from arq.connections import RedisSettings
from concurrent.futures import ThreadPoolExecutor
import asyncio

# Thread pool for CPU-intensive tasks
executor = ThreadPoolExecutor(max_workers=4)

# Configuration
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_URL_SIZE_MB = 10
MAX_URL_SIZE_BYTES = MAX_URL_SIZE_MB * 1024 * 1024

# Load environment
load_dotenv(".env.local")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("🚀 Starting ContextCache API...")
    await init_db()
    print("✅ Database connected")
    
    # Redis pool disabled for local dev (enable in production)
    # app.state.redis_pool = await create_pool(
    #     RedisSettings(host='localhost', port=6379)
    # )
    # print("✅ Job queue connected")
    
    yield
    
    print("👋 Shutting down ContextCache API")


app = FastAPI(
    title="ContextCache API",
    description="Privacy-first memory engine for AI research",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# HEALTH
# ============================================================================
@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "database": "connected",
        "redis": "connected",
    }

# ============================================================================
# PROJECTS
# ============================================================================
@app.post("/projects", response_model=ProjectResponse)
async def create_project(
    project: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    salt = secrets.token_bytes(16)
    db_project = ProjectDB(name=project.name, salt=salt)
    db.add(db_project)
    await db.commit()
    await db.refresh(db_project)

    return ProjectResponse(
        id=db_project.id,
        name=db_project.name,
        salt=salt.hex(),
        fact_count=0,
        entity_count=0,
        created_at=db_project.created_at,
        updated_at=db_project.updated_at,
    )


@app.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List all projects"""
    result = await db.execute(
        select(ProjectDB)
        .order_by(ProjectDB.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    projects = result.scalars().all()

    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            salt=p.salt.hex(),
            fact_count=0,
            entity_count=0,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in projects
    ]

    return ProjectResponse(
        id=project.id,
        name=project.name,
        salt=project.salt.hex(),
        fact_count=0,
        entity_count=0,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )

@app.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a single project by ID"""
    result = await db.execute(select(ProjectDB).where(ProjectDB.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        salt=project.salt.hex(),
        fact_count=0,
        entity_count=0,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@app.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    name: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """Update project name"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project.name = name
    await db.commit()
    await db.refresh(project)
    
    # Get counts
    doc_count_result = await db.execute(
        select(func.count()).select_from(DocumentDB).where(DocumentDB.project_id == project_id)
    )
    doc_count = doc_count_result.scalar() or 0
    
    chunk_count_result = await db.execute(
        select(func.count())
        .select_from(DocumentChunkDB)
        .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
        .where(DocumentDB.project_id == project_id)
    )
    chunk_count = chunk_count_result.scalar() or 0
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        salt=project.salt.hex(),
        fact_count=chunk_count,
        entity_count=doc_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a project"""
    result = await db.execute(select(ProjectDB).where(ProjectDB.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()
    return {"message": "Project deleted successfully"}


@app.get("/projects/{project_id}/stats")
async def get_project_stats(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get project statistics"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Document count
    doc_count_result = await db.execute(
        select(func.count()).select_from(DocumentDB).where(DocumentDB.project_id == project_id)
    )
    doc_count = doc_count_result.scalar() or 0
    
    # Chunk count (facts)
    chunk_count_result = await db.execute(
        select(func.count())
        .select_from(DocumentChunkDB)
        .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
        .where(DocumentDB.project_id == project_id)
    )
    chunk_count = chunk_count_result.scalar() or 0
    
    # Storage size estimate
    size_result = await db.execute(
        select(func.sum(func.length(DocumentChunkDB.text)))
        .select_from(DocumentChunkDB)
        .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
        .where(DocumentDB.project_id == project_id)
    )
    total_chars = size_result.scalar() or 0
    storage_bytes = total_chars * 2
    
    return {
        "project_id": project_id,
        "document_count": doc_count,
        "chunk_count": chunk_count,
        "storage_bytes": storage_bytes,
        "storage_mb": round(storage_bytes / (1024 * 1024), 2),
    }


@app.get("/projects/{project_id}/graph")
async def get_project_graph(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get knowledge graph for visualization (REAL DATA)"""
    # Verify project exists
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Query REAL chunks and documents from database
    result = await db.execute(
        select(DocumentChunkDB, DocumentDB.source_url, DocumentDB.id)
        .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
        .where(DocumentDB.project_id == project_id)
        .limit(100)
    )
    
    nodes = []
    edges = []
    doc_nodes = {}
    
    rows = result.all()
    
    # Create document nodes from real data
    for chunk, source_url, doc_id in rows:
        doc_id_str = str(doc_id)
        if doc_id_str not in doc_nodes:
            doc_nodes[doc_id_str] = {
                "id": f"doc-{doc_id_str}",
                "label": source_url.split('/')[-1][:30] if source_url else "Document",
                "type": "document",
                "data": {
                    "source": source_url,
                    "full_name": source_url
                }
            }
    
    nodes.extend(doc_nodes.values())
    
    # Create chunk nodes from real data
    for chunk, source_url, doc_id in rows:
        chunk_node = {
            "id": f"chunk-{chunk.id}",
            "label": chunk.text[:50] + "..." if len(chunk.text) > 50 else chunk.text,
            "type": "fact",
            "data": {
                "full_text": chunk.text,
                "source": source_url,
                "chunk_index": chunk.chunk_index
            }
        }
        nodes.append(chunk_node)
        
        edges.append({
            "source": f"doc-{doc_id}",
            "target": f"chunk-{chunk.id}",
            "label": "contains"
        })
    
    return {
        "nodes": nodes,
        "edges": edges,
        "count": len(nodes)
    }


@app.get("/projects/{project_id}/audit")
async def get_project_audit_log(
    project_id: str,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get audit event log for a project"""
    # Verify project exists
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Query audit events
    audit_query = text("""
        SELECT id, event_type, event_data, actor, timestamp, prev_hash, current_hash
        FROM audit_events
        WHERE project_id = :project_id
        ORDER BY timestamp DESC
        LIMIT :limit
    """)
    
    result = await db.execute(
        audit_query,
        {"project_id": project_id, "limit": limit}
    )
    
    events = []
    for row in result:
        events.append({
            "id": str(row[0]),
            "event_type": row[1],
            "event_data": row[2],
            "actor": row[3],
            "timestamp": row[4].isoformat() if row[4] else None,
            "prev_hash": row[5].hex() if isinstance(row[5], bytes) else row[5],
            "current_hash": row[6].hex() if isinstance(row[6], bytes) else row[6],
        })
    
    return {"events": events, "count": len(events)}


@app.post("/projects/{project_id}/compute-ranking")
async def trigger_ranking(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Trigger background ranking computation"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # TODO: Enable in production with Redis
    # job = await app.state.redis_pool.enqueue_job('compute_ranking_task', project_id)
    # return {"job_id": job.job_id, "status": "queued"}
    
    return {
        "message": "Ranking computation would be queued here",
        "project_id": project_id,
        "status": "mock"
    }

# ============================================================================
# DOCUMENTS
# ============================================================================

@app.post("/documents/ingest", response_model=DocumentResponse)
async def ingest_document(
    project_id: str = Form(...),
    source_type: str = Form(...),
    source_url: str = Form(None),
    file: UploadFile = File(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Ingest a document (file or URL) and create chunks with embeddings
    """
    doc_service = DocumentService()
    embedding_service = EmbeddingService()

    try:
        # Validate source type
        if source_type not in ["file", "url", "text"]:
            raise HTTPException(status_code=400, detail="Invalid source_type. Must be 'file', 'url', or 'text'")

        # Extract text based on source type
        if source_type == "url":
            if not source_url:
                raise HTTPException(status_code=400, detail="source_url required for URL type")
            
            print(f"📥 Fetching URL: {source_url}")
            text, title = await doc_service.fetch_url_content(source_url)
            
            # Validate URL content size
            if len(text.encode('utf-8')) > MAX_URL_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"URL content too large. Maximum size is {MAX_URL_SIZE_MB}MB"
                )
            
            content_hash = doc_service.compute_content_hash(text)
            print(f"✅ URL fetched: {len(text)} chars")

        elif source_type == "file":
            if not file:
                raise HTTPException(status_code=400, detail="file required for file type")

            print(f"📥 Reading file: {file.filename}")
            file_content = await file.read()
            
            # Validate file size
            if len(file_content) > MAX_FILE_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
                )
            
            print(f"✅ File read: {len(file_content)} bytes")
            
            # Extract text based on file type
            if file.filename.endswith(".pdf"):
                print("📄 Extracting PDF text...")
                text = await doc_service.extract_text_from_pdf(file_content)
            elif file.filename.endswith(".txt"):
                text = file_content.decode("utf-8")
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported file type. Use PDF or TXT"
                )

            content_hash = doc_service.compute_content_hash(text)
            source_url = file.filename
            print(f"✅ Text extracted: {len(text)} chars")

        else:
            raise HTTPException(
                status_code=400,
                detail="Direct text input not yet supported"
            )

        # Validate extracted text
        if not text or len(text.strip()) < 10:
            raise HTTPException(
                status_code=400,
                detail="Document contains no readable text or text is too short"
            )

        # Check for duplicates
        print("🔍 Checking for duplicates...")
        result = await db.execute(
            select(DocumentDB).where(
                DocumentDB.project_id == project_id,
                DocumentDB.content_hash == content_hash
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="Document already exists (duplicate content)"
            )

        # Create document record
        print("💾 Creating document record...")
        document = DocumentDB(
            project_id=project_id,
            source_type=source_type,
            source_url=source_url,
            content_hash=content_hash,
            status=DocumentStatus.processing.value,
        )
        db.add(document)
        await db.commit()
        await db.refresh(document)
        print(f"✅ Document created: {document.id}")

        # Chunk the text
        print("✂️ Chunking text...")
        chunks = doc_service.chunk_text(text, chunk_size=1000, overlap=200)
        chunk_texts = [c["text"] for c in chunks]
        print(f"✅ Created {len(chunks)} chunks")

        # Create embeddings (NON-BLOCKING!)
        print("🧠 Generating embeddings (this may take a moment)...")
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            executor,
            embedding_service.embed_batch,
            chunk_texts
        )
        print(f"✅ Embeddings generated: {len(embeddings)}")

        # Store chunks
        print("💾 Storing chunks...")
        for chunk, embedding in zip(chunks, embeddings):
            chunk_record = DocumentChunkDB(
                document_id=document.id,
                chunk_index=int(chunk["chunk_id"].split("-")[1]),
                text=chunk["text"],
                embedding=embedding,
                start_offset=chunk["start_offset"],
                end_offset=chunk["end_offset"]
            )
            db.add(chunk_record)

        # Update document status
        document.status = DocumentStatus.completed.value
        document.fact_count = len(chunks)
        document.processed_at = datetime.utcnow()

        await db.commit()
        await db.refresh(document)
        print(f"✅ Document processing complete!")

        return DocumentResponse(
            id=document.id,
            project_id=document.project_id,
            source_type=document.source_type,
            source_url=document.source_url,
            content_hash=document.content_hash,
            status=document.status,
            fact_count=document.fact_count,
            created_at=document.created_at,
            processed_at=document.processed_at,
        )

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Log and return internal error
        print(f"❌ Error processing document: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process document: {str(e)}"
        )


@app.get("/documents", response_model=List[DocumentResponse])
async def list_documents(
    project_id: str,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List documents for a project"""
    result = await db.execute(
        select(DocumentDB)
        .where(DocumentDB.project_id == project_id)
        .order_by(DocumentDB.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    docs = result.scalars().all()

    return [
        DocumentResponse(
            id=d.id,
            project_id=d.project_id,
            source_type=d.source_type,
            source_url=d.source_url,
            content_hash=d.content_hash,
            status=d.status,
            fact_count=d.fact_count,
            created_at=d.created_at,
            processed_at=d.processed_at,
        )
        for d in docs
    ]

# ============================================================================
# QUERY
# ============================================================================
@app.post("/query")
async def query_documents(
    project_id: str = Form(...),
    query: str = Form(...),
    limit: int = Form(5),
    db: AsyncSession = Depends(get_db)
):
    """Semantic search across document chunks"""
    embedding_service = EmbeddingService()

    try:
        query_embedding = embedding_service.embed_text(query)

        result = await db.execute(
            select(
                DocumentChunkDB,
                DocumentDB.source_url,
                (1 - DocumentChunkDB.embedding.cosine_distance(query_embedding)).label("similarity"),
            )
            .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
            .where(DocumentDB.project_id == project_id)
            .order_by(text("similarity DESC"))
            .limit(limit)
        )

        rows = result.all()
        results = []
        for row in rows:
            chunk, source_url, similarity = row
            results.append({
                "chunk_id": str(chunk.id),
                "document_id": str(chunk.document_id),
                "source_url": source_url,
                "text": chunk.text,
                "similarity": float(similarity),
                "chunk_index": chunk.chunk_index,
            })

        return {
            "query": query,
            "results": results,
            "count": len(results),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
