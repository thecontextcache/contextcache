"""
ContextCache API - Main entry point
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from uuid import UUID

app = FastAPI(
    title="ContextCache API",
    description="Privacy-first memory engine for AI research",
    version="0.1.0"
)

# Pydantic models for request/response
class RankRequest(BaseModel):
    project_id: str

class RankResponse(BaseModel):
    project_id: str
    facts_ranked: int
    algorithm: str
    version: str
    status: str

class DecayResponse(BaseModel):
    project_id: str
    facts_updated: int
    status: str


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "0.1.0"
    }


@app.post("/ranking/compute", response_model=RankResponse)
async def compute_ranking(request: RankRequest):
    """
    Trigger ranking computation for a project.
    
    This runs PageRank + Time Decay on all facts.
    """
    from cc_core.services import RankingService
    from cc_core.storage import PostgresAdapter
    import os
    
    # TODO: Get from dependency injection in production
    storage = PostgresAdapter(
        connection_url=os.getenv("DATABASE_URL", "postgresql://contextcache:devpassword@localhost:5432/contextcache_dev"),
        encryption_key=b'test_key_32_bytes_for_dev_only!!'
    )
    await storage.connect()
    
    try:
        service = RankingService(storage)
        result = await service.rank_project(UUID(request.project_id))
        return result
    finally:
        await storage.disconnect()


@app.post("/ranking/decay", response_model=DecayResponse)
async def apply_decay(request: RankRequest):
    """
    Apply time decay to fact scores for a project.
    """
    from cc_core.services import RankingService
    from cc_core.storage import PostgresAdapter
    import os
    
    storage = PostgresAdapter(
        connection_url=os.getenv("DATABASE_URL", "postgresql://contextcache:devpassword@localhost:5432/contextcache_dev"),
        encryption_key=b'test_key_32_bytes_for_dev_only!!'
    )
    await storage.connect()
    
    try:
        service = RankingService(storage)
        result = await service.apply_decay(UUID(request.project_id))
        return result
    finally:
        await storage.disconnect()


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "ContextCache API",
        "version": "0.1.0",
        "docs": "/docs"
    }