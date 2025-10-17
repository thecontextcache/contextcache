"""
ContextCache API - Main entry point
"""
import os
import secrets
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from fastapi import File, UploadFile, Form
from pydantic import BaseModel, Field, HttpUrl, validator
import re
from cc_core.storage.database import get_db, init_db
from cc_core.models.project import ProjectDB, ProjectCreate, ProjectResponse
from cc_core.models.user import UserDB, UserResponse, UnlockSessionResponse, SessionStatusResponse
from cc_core.models.document import (
    DocumentDB, DocumentResponse,
    DocumentStatus, SourceType
)
from cc_core.models.chunk import DocumentChunkDB
from cc_core.services.document_service import DocumentService
from cc_core.services.embedding_service import EmbeddingService
from cc_core.services.key_service import get_key_service
from cc_core.auth import get_current_user, get_optional_user
from datetime import datetime
from dotenv import load_dotenv
from cc_core.crypto import Hasher
from cc_core.crypto.encryption import Encryptor
from arq import create_pool
from arq.connections import RedisSettings
from concurrent.futures import ThreadPoolExecutor
import asyncio
from cc_core.rate_limit import RateLimitMiddleware

# Sentry initialization (optional)
try:
    import sentry_sdk
    if os.getenv("SENTRY_DSN"):
        sentry_sdk.init(
            dsn=os.getenv("SENTRY_DSN"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.getenv("ENVIRONMENT", "development"),
        )
        print("✅ Sentry monitoring enabled")
except ImportError:
    print("ℹ️ Sentry SDK not installed (pip install sentry-sdk[fastapi])")

# Thread pool for CPU-intensive tasks
executor = ThreadPoolExecutor(max_workers=4)

# Configuration
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_URL_SIZE_MB = 10
MAX_URL_SIZE_BYTES = MAX_URL_SIZE_MB * 1024 * 1024
MAX_PROJECT_NAME_LENGTH = 200
MAX_SOURCE_URL_LENGTH = 2000
ALLOWED_FILE_EXTENSIONS = {".pdf", ".txt"}

# Load environment
load_dotenv(".env.local")


def validate_environment():
    """Validate required environment variables at startup"""
    print("🔍 Validating environment variables...")
    
    # Check required variables
    required_vars = ["DATABASE_URL"]
    missing = [var for var in required_vars if not os.getenv(var)]
    
    if missing:
        raise ValueError(f"❌ Missing required environment variables: {', '.join(missing)}")
    
    print("✅ Required environment variables present")
    
    # Warn about recommended variables
    recommended = {
        "REDIS_URL": "Job queue disabled - all processing will be synchronous",
        "SENTRY_DSN": "Error monitoring disabled - production errors won't be tracked",
        "CORS_ORIGINS": "CORS using default localhost:3000",
    }
    
    for var, message in recommended.items():
        if not os.getenv(var):
            print(f"⚠️ {var} not set - {message}")
    
    print()


# Validate environment on module load
validate_environment()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("🚀 Starting ContextCache API...")
    await init_db()
    print("✅ Database connected")
    
    # Enable Redis pool if configured
    if os.getenv("REDIS_URL"):
        try:
            app.state.redis_pool = await create_pool(
                RedisSettings.from_dsn(os.getenv("REDIS_URL"))
            )
            print("✅ Job queue connected")
        except Exception as e:
            print(f"⚠️ Failed to connect to Redis: {e}")
            app.state.redis_pool = None
    else:
        app.state.redis_pool = None
        print("ℹ️ Redis not configured (jobs will run inline)")
    
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

# Rate limiting middleware
if os.getenv("REDIS_URL"):
    app.add_middleware(
        RateLimitMiddleware,
        redis_url=os.getenv("REDIS_URL"),
        requests_per_minute=60,
        requests_per_hour=1000,
    )
    print("✅ Rate limiting enabled")

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests with timing information"""
    start_time = time.time()
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration = time.time() - start_time
    
    # Log request details
    print(
        f"{request.method} {request.url.path} - "
        f"Status: {response.status_code} - "
        f"Duration: {duration:.2f}s - "
        f"Client: {request.client.host if request.client else 'unknown'}"
    )
    
    # Add custom headers
    response.headers["X-Process-Time"] = f"{duration:.2f}"
    
    return response

# ============================================================================
# HEALTH
# ============================================================================
@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    """Health check endpoint with detailed status"""
    health_status = {
        "status": "healthy",
        "version": "0.1.0",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {}
    }
    
    # Database check
    try:
        await db.execute(text("SELECT 1"))
        health_status["checks"]["database"] = {
            "status": "connected",
            "type": "postgresql"
        }
    except Exception as e:
        health_status["status"] = "degraded"
        health_status["checks"]["database"] = {
            "status": "disconnected",
            "error": str(e)
        }
    
    # Redis check
    if hasattr(app.state, 'redis_pool') and app.state.redis_pool:
        try:
            # Try to get pool info
            health_status["checks"]["redis"] = {
                "status": "connected",
                "type": "redis"
            }
        except Exception as e:
            health_status["checks"]["redis"] = {
                "status": "degraded",
                "error": str(e)
            }
    else:
        health_status["checks"]["redis"] = {
            "status": "not_configured"
        }
    
    # Sentry check
    if os.getenv("SENTRY_DSN"):
        health_status["checks"]["monitoring"] = {
            "status": "enabled",
            "type": "sentry"
        }
    else:
        health_status["checks"]["monitoring"] = {
            "status": "not_configured"
        }
    
    return health_status

# ============================================================================
# AUTHENTICATION
# ============================================================================
@app.post("/auth/unlock", response_model=UnlockSessionResponse)
async def unlock_session(
    master_passphrase: str = Form(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unlock user session by deriving KEK from master passphrase
    
    Flow:
    1. User authenticated via Clerk JWT
    2. Fetch/create user record with KEK salt
    3. Derive KEK from passphrase + salt (Argon2id)
    4. Store KEK in Redis (encrypted with session secret)
    
    The KEK is used to encrypt/decrypt project DEKs.
    """
    key_service = get_key_service()
    encryptor = Encryptor()
    
    # Get or create user record
    result = await db.execute(
        select(UserDB).where(UserDB.clerk_user_id == current_user["clerk_user_id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # First time user - create record with new KEK salt
        kek_salt = encryptor.generate_salt()
        user = UserDB(
            clerk_user_id=current_user["clerk_user_id"],
            email=current_user.get("email", ""),
            kek_salt=kek_salt,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        print(f"✅ New user created: {user.clerk_user_id[:10]}... (email: {user.email})")
    
    # Derive KEK from passphrase
    try:
        kek = encryptor.derive_key(master_passphrase, user.kek_salt)
        print(f"✅ KEK derived for user {user.clerk_user_id[:10]}...")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to derive encryption key: {str(e)}"
        )
    
    # Store KEK in Redis (session-bound, 1 hour TTL)
    session_id = current_user["session_id"]
    await key_service.store_kek(session_id, kek, ttl=3600)
    
    return UnlockSessionResponse(
        status="unlocked",
        user_id=str(user.id),
        session_id=session_id,
        expires_in=3600,
    )


@app.get("/auth/status", response_model=SessionStatusResponse)
async def check_session_status(
    current_user: dict = Depends(get_current_user)
):
    """
    Check if current session is unlocked (KEK exists in Redis)
    
    Returns:
        unlocked: True if KEK found, False if session needs unlocking
    """
    key_service = get_key_service()
    session_id = current_user["session_id"]
    
    kek = await key_service.get_kek(session_id)
    
    if kek:
        return SessionStatusResponse(
            unlocked=True,
            session_id=session_id
        )
    else:
        return SessionStatusResponse(
            unlocked=False,
            message="Session locked. Please enter your master passphrase to unlock."
        )


@app.post("/auth/logout")
async def logout(
    current_user: dict = Depends(get_current_user)
):
    """
    Clear all session keys on logout
    
    This removes:
    - KEK (Key Encryption Key)
    - All cached DEKs for this session
    
    User will need to re-enter master passphrase on next login.
    """
    key_service = get_key_service()
    session_id = current_user["session_id"]
    
    await key_service.clear_session(session_id)
    
    return {
        "status": "logged_out",
        "message": "All session keys cleared. Sign in again to continue."
    }


# ============================================================================
# PROJECTS
# ============================================================================
@app.post("/projects", response_model=ProjectResponse)
async def create_project(
    name: str = Form(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new project with DEK encrypted by user's KEK
    
    Flow:
    1. Verify user is authenticated (JWT)
    2. Get KEK from Redis (session must be unlocked)
    3. Generate random DEK for this project
    4. Encrypt DEK with KEK
    5. Store encrypted_dek in database
    6. Cache DEK in Redis (5 min)
    """
    # Validate project name length
    if len(name) > MAX_PROJECT_NAME_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Project name too long. Maximum length is {MAX_PROJECT_NAME_LENGTH} characters"
        )
    
    if len(name.strip()) < 1:
        raise HTTPException(
            status_code=400,
            detail="Project name cannot be empty"
        )
    
    key_service = get_key_service()
    
    # Get KEK from Redis (verify session is unlocked)
    session_id = current_user["session_id"]
    kek = await key_service.get_kek(session_id)
    
    if not kek:
        raise HTTPException(
            status_code=401,
            detail="Session locked. Please unlock with your master passphrase at /auth/unlock"
        )
    
    # Get user record
    result = await db.execute(
        select(UserDB).where(UserDB.clerk_user_id == current_user["clerk_user_id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found. Please unlock session first."
        )
    
    # Generate random DEK for this project (32 bytes)
    dek = key_service.generate_dek()
    
    # Encrypt DEK with KEK
    encrypted_dek, dek_nonce = await key_service.encrypt_dek_with_kek(dek, kek)
    
    # Create project record
    db_project = ProjectDB(
        name=name,
        user_id=user.id,
        encrypted_dek=encrypted_dek,
        dek_nonce=dek_nonce
    )
    db.add(db_project)
    await db.commit()
    await db.refresh(db_project)
    
    # Cache DEK in Redis (5 min TTL)
    await key_service.store_dek(session_id, str(db_project.id), dek, ttl=300)
    
    print(f"✅ Project created: {db_project.name} (id: {str(db_project.id)[:8]}...)")

    return ProjectResponse(
        id=db_project.id,
        name=db_project.name,
        salt="",  # Deprecated, kept for backwards compatibility
        fact_count=0,
        entity_count=0,
        created_at=db_project.created_at,
        updated_at=db_project.updated_at,
    )


@app.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    limit: int = 20,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List user's projects (multi-tenant isolation)"""
    # Validate pagination parameters
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")
    if offset < 0:
        raise HTTPException(status_code=400, detail="Offset must be non-negative")
    
    # Get user record
    result = await db.execute(
        select(UserDB).where(UserDB.clerk_user_id == current_user["clerk_user_id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # User not found - return empty list
        return []
    
    # Query only user's projects (multi-tenant isolation)
    result = await db.execute(
        select(ProjectDB)
        .where(ProjectDB.user_id == user.id)
        .order_by(ProjectDB.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    projects = result.scalars().all()

    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            salt="",  # Deprecated
            fact_count=0,
            entity_count=0,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in projects
    ]

@app.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a single project by ID (with ownership verification)
    Also decrypts and caches the project DEK for subsequent operations
    """
    # Get user record
    result = await db.execute(
        select(UserDB).where(UserDB.clerk_user_id == current_user["clerk_user_id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get project with ownership verification
    result = await db.execute(
        select(ProjectDB).where(
            ProjectDB.id == project_id,
            ProjectDB.user_id == user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    
    # Decrypt and cache DEK for future operations
    key_service = get_key_service()
    session_id = current_user["session_id"]
    
    # Check if DEK is already cached
    cached_dek = await key_service.get_dek(session_id, project_id)
    
    if not cached_dek and project.encrypted_dek:
        # DEK not cached - decrypt it
        kek = await key_service.get_kek(session_id)
        if kek and project.dek_nonce:
            try:
                dek = await key_service.decrypt_dek_with_kek(
                    project.encrypted_dek,
                    project.dek_nonce,
                    kek
                )
                # Cache for 5 minutes
                await key_service.store_dek(session_id, project_id, dek, ttl=300)
                print(f"✅ DEK decrypted and cached for project {project_id[:8]}...")
            except Exception as e:
                print(f"⚠️ Failed to decrypt DEK: {e}")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        salt="",  # Deprecated
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
    # Validate name
    if len(name) > MAX_PROJECT_NAME_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Project name too long. Maximum length is {MAX_PROJECT_NAME_LENGTH} characters"
        )
    
    if len(name.strip()) < 1:
        raise HTTPException(
            status_code=400,
            detail="Project name cannot be empty"
        )
    
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

@app.post("/documents/ingest")
async def ingest_document(
    project_id: str = Form(...),
    source_type: str = Form(...),
    source_url: str = Form(None),
    file: UploadFile = File(None),
    background: bool = Form(False),
    db: AsyncSession = Depends(get_db)
):
    """
    Ingest a document (file or URL) and create chunks with embeddings.
    If background=True and Redis is configured, queues the job.
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
            
            # Validate URL length
            if len(source_url) > MAX_SOURCE_URL_LENGTH:
                raise HTTPException(
                    status_code=400,
                    detail=f"URL too long. Maximum length is {MAX_SOURCE_URL_LENGTH} characters"
                )
            
            # Validate URL format
            if not source_url.startswith(('http://', 'https://')):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid URL. Must start with http:// or https://"
                )
            
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

            # Validate filename
            if not file.filename:
                raise HTTPException(status_code=400, detail="Invalid file: no filename")
            
            # Validate file extension
            file_ext = os.path.splitext(file.filename)[1].lower()
            if file_ext not in ALLOWED_FILE_EXTENSIONS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type '{file_ext}'. Allowed types: {', '.join(ALLOWED_FILE_EXTENSIONS)}"
                )

            print(f"📥 Reading file: {file.filename}")
            file_content = await file.read()
            
            # Validate file size
            if len(file_content) > MAX_FILE_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
                )
            
            # Validate file is not empty
            if len(file_content) == 0:
                raise HTTPException(
                    status_code=400,
                    detail="File is empty"
                )
            
            print(f"✅ File read: {len(file_content)} bytes")
            
            # Extract text based on file type
            if file_ext == ".pdf":
                print("📄 Extracting PDF text...")
                text = await doc_service.extract_text_from_pdf(file_content)
            elif file_ext == ".txt":
                try:
                    text = file_content.decode("utf-8")
                except UnicodeDecodeError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid text file encoding. Must be UTF-8"
                    )
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
            status=DocumentStatus.queued.value if background else DocumentStatus.processing.value,
        )
        db.add(document)
        await db.commit()
        await db.refresh(document)
        print(f"✅ Document created: {document.id}")

        # Check if we should queue this job
        if background and hasattr(app.state, 'redis_pool') and app.state.redis_pool:
            try:
                job = await app.state.redis_pool.enqueue_job(
                    'process_document_task',
                    str(document.id)
                )
                print(f"✅ Job queued: {job.job_id}")
                return {
                    "id": str(document.id),
                    "project_id": document.project_id,
                    "source_type": document.source_type,
                    "source_url": document.source_url,
                    "status": "queued",
                    "job_id": job.job_id,
                    "created_at": document.created_at.isoformat(),
                }
            except Exception as e:
                print(f"⚠️ Failed to queue job, processing inline: {e}")
                # Fall through to inline processing

        # Process inline (default)
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
    # Validate pagination parameters
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")
    if offset < 0:
        raise HTTPException(status_code=400, detail="Offset must be non-negative")
    
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
    # Validate query
    if not query or len(query.strip()) < 1:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    if len(query) > 1000:
        raise HTTPException(status_code=400, detail="Query too long. Maximum length is 1000 characters")
    
    # Validate limit
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 50")
    
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
