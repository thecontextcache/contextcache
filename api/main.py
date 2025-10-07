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