"""
ContextCache API - Main entry point
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events (startup/shutdown)."""
    # Startup
    print("🚀 ContextCache API starting...")
    yield
    # Shutdown
    print("👋 ContextCache API shutting down...")


app = FastAPI(
    title="ContextCache API",
    description="Privacy-first memory engine for AI research",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "services": {
            "database": "not_configured",
            "redis": "not_configured",
            "mcp_servers": "not_configured"
        }
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "ContextCache API",
        "version": "0.1.0",
        "docs": "/docs"
    }


# TODO Phase 2: Register routers
# app.include_router(projects.router)
# app.include_router(facts.router)
# app.include_router(entities.router)
# app.include_router(audit.router)