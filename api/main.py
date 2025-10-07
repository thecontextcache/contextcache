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
from sqlalchemy import select, func
from cc_core.storage.database import get_db, init_db
from cc_core.models.project import ProjectDB, ProjectCreate, ProjectResponse
from fastapi import File, UploadFile, Form, BackgroundTasks
from cc_core.models.document import (
    DocumentDB, DocumentCreate, DocumentResponse, 
    DocumentStatus, SourceType, DocumentChunk
)
from cc_core.services.document_service import DocumentService
from datetime import datetime



# Load environment
from dotenv import load_dotenv
load_dotenv(".env.local")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    print("🚀 Starting ContextCache API...")
    await init_db()
    print("✅ Database connected")
    yield
    # Shutdown
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


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "database": "connected",
        "redis": "connected",
    }


@app.post("/projects", response_model=ProjectResponse)
async def create_project(
    project: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    # Generate salt for Argon2id
    salt = secrets.token_bytes(16)  # 128 bits
    
    # Create project in database
    db_project = ProjectDB(
        name=project.name,
        salt=salt,
    )
    db.add(db_project)
    await db.commit()
    await db.refresh(db_project)
    
    # Get counts (will be 0 for new project)
    fact_count_result = await db.execute(
        select(func.count()).select_from(ProjectDB).where(ProjectDB.id == db_project.id)
    )
    fact_count = 0
    
    entity_count = 0
    
    return ProjectResponse(
        id=db_project.id,
        name=db_project.name,
        salt=salt.hex(),  # Return as hex string
        fact_count=fact_count,
        entity_count=entity_count,
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
    # Get projects
    result = await db.execute(
        select(ProjectDB)
        .order_by(ProjectDB.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    projects = result.scalars().all()
    
    # Build responses with counts
    responses = []
    for project in projects:
        responses.append(ProjectResponse(
            id=project.id,
            name=project.name,
            salt=project.salt.hex(),
            fact_count=0,  # Will implement counting later
            entity_count=0,
            created_at=project.created_at,
            updated_at=project.updated_at,
        ))
    
    return responses


@app.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get a single project by ID"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
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


@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a project"""
    result = await db.execute(
        select(ProjectDB).where(ProjectDB.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.delete(project)
    await db.commit()
    
    return {"message": "Project deleted successfully"}

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
    Ingest a document (file or URL)
    """
    doc_service = DocumentService()
    
    try:
        # Validate source type
        if source_type not in ["file", "url", "text"]:
            raise HTTPException(status_code=400, detail="Invalid source_type")
        
        # Extract text based on source type
        if source_type == "url":
            if not source_url:
                raise HTTPException(status_code=400, detail="source_url required for URL type")
            
            text, title = await doc_service.fetch_url_content(source_url)
            content_hash = doc_service.compute_content_hash(text)
            
        elif source_type == "file":
            if not file:
                raise HTTPException(status_code=400, detail="file required for file type")
            
            # Read file content
            file_content = await file.read()
            
            # Check file type and extract text
            if file.filename.endswith('.pdf'):
                text = await doc_service.extract_text_from_pdf(file_content)
            elif file.filename.endswith('.txt'):
                text = file_content.decode('utf-8')
            else:
                raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or TXT")
            
            content_hash = doc_service.compute_content_hash(text)
            source_url = file.filename
        
        else:  # text type
            raise HTTPException(status_code=400, detail="Direct text input not yet supported")
        
        # Check for duplicates
        result = await db.execute(
            select(DocumentDB).where(
                DocumentDB.project_id == project_id,
                DocumentDB.content_hash == content_hash
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            raise HTTPException(status_code=409, detail="Document already exists (duplicate content)")
        
        # Create document record
        document = DocumentDB(
            project_id=project_id,
            source_type=source_type,
            source_url=source_url,
            content_hash=content_hash,
            status=DocumentStatus.completed.value,
            processed_at=datetime.utcnow()
        )
        
        db.add(document)
        await db.commit()
        await db.refresh(document)
        
        return DocumentResponse(
            id=document.id,
            project_id=document.project_id,
            source_type=document.source_type,
            source_url=document.source_url,
            content_hash=document.content_hash,
            status=document.status,
            fact_count=document.fact_count,
            created_at=document.created_at,
            processed_at=document.processed_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")


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
    documents = result.scalars().all()
    
    return [
        DocumentResponse(
            id=doc.id,
            project_id=doc.project_id,
            source_type=doc.source_type,
            source_url=doc.source_url,
            content_hash=doc.content_hash,
            status=doc.status,
            fact_count=doc.fact_count,
            created_at=doc.created_at,
            processed_at=doc.processed_at
        )
        for doc in documents
    ]