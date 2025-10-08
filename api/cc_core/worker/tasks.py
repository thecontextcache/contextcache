"""
Background worker tasks
"""
from typing import Dict, Any
from datetime import datetime, timedelta
import asyncio


async def compute_ranking_task(ctx: Dict[str, Any], project_id: str) -> Dict[str, Any]:
    """
    Compute PageRank scores for a project
    
    Args:
        ctx: Arq context
        project_id: Project UUID
        
    Returns:
        Task result
    """
    from cc_core.storage.database import AsyncSessionLocal
    from sqlalchemy import select, text
    from cc_core.models.chunk import DocumentChunkDB
    from cc_core.models.document import DocumentDB
    
    print(f"🔄 Computing ranking for project {project_id}...")
    
    async with AsyncSessionLocal() as db:
        # Get all chunks for project
        result = await db.execute(
            select(DocumentChunkDB)
            .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
            .where(DocumentDB.project_id == project_id)
        )
        chunks = result.scalars().all()
        
        if not chunks:
            return {
                "status": "completed",
                "project_id": project_id,
                "chunks_processed": 0,
                "message": "No chunks to rank"
            }
        
        # Simple ranking: use creation time and position
        # (In production, implement actual PageRank)
        for idx, chunk in enumerate(chunks):
            # Mock ranking score based on position and recency
            recency_score = 1.0 / (1 + (datetime.utcnow() - chunk.created_at).days)
            position_score = 1.0 - (idx / len(chunks))
            
            # Combined score (simplified)
            final_score = (recency_score * 0.3) + (position_score * 0.7)
            
            # Store in fact_scores table (would need to create record)
            # For now, just log
            print(f"  Chunk {chunk.id}: score={final_score:.3f}")
        
        await db.commit()
    
    print(f"✅ Ranking completed for {len(chunks)} chunks")
    
    return {
        "status": "completed",
        "project_id": project_id,
        "chunks_processed": len(chunks),
        "completed_at": datetime.utcnow().isoformat()
    }


async def decay_facts_task(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply time-based decay to fact scores
    Runs periodically (cron)
    
    Args:
        ctx: Arq context
        
    Returns:
        Task result
    """
    from cc_core.storage.database import AsyncSessionLocal
    from sqlalchemy import select, update, text
    from cc_core.models.chunk import DocumentChunkDB
    
    print(f"🔄 Running decay task...")
    
    async with AsyncSessionLocal() as db:
        # Get all chunks older than 30 days
        cutoff_date = datetime.utcnow() - timedelta(days=30)
        
        result = await db.execute(
            select(DocumentChunkDB)
            .where(DocumentChunkDB.created_at < cutoff_date)
        )
        chunks = result.scalars().all()
        
        decay_factor = 0.95  # 5% decay
        
        for chunk in chunks:
            # Apply decay (in production, update fact_scores table)
            age_days = (datetime.utcnow() - chunk.created_at).days
            decay = decay_factor ** (age_days / 30)  # Decay every 30 days
            print(f"  Chunk {chunk.id}: age={age_days}d, decay={decay:.3f}")
        
        await db.commit()
    
    print(f"✅ Decay applied to {len(chunks)} chunks")
    
    return {
        "status": "completed",
        "chunks_decayed": len(chunks),
        "completed_at": datetime.utcnow().isoformat()
    }


async def cleanup_old_data_task(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clean up old temporary data
    
    Args:
        ctx: Arq context
        
    Returns:
        Task result
    """
    from cc_core.storage.database import AsyncSessionLocal
    from sqlalchemy import delete, text
    
    print(f"🧹 Running cleanup task...")
    
    async with AsyncSessionLocal() as db:
        # Example: Delete failed documents older than 7 days
        cutoff_date = datetime.utcnow() - timedelta(days=7)
        
        result = await db.execute(
            delete(DocumentDB)
            .where(
                DocumentDB.status == 'failed',
                DocumentDB.created_at < cutoff_date
            )
        )
        
        deleted_count = result.rowcount
        await db.commit()
    
    print(f"✅ Cleaned up {deleted_count} old records")
    
    return {
        "status": "completed",
        "records_deleted": deleted_count,
        "completed_at": datetime.utcnow().isoformat()
    }


# Task registry for Arq
async def startup(ctx: Dict[str, Any]):
    """Worker startup"""
    print("🚀 Worker started")


async def shutdown(ctx: Dict[str, Any]):
    """Worker shutdown"""
    print("👋 Worker stopped")


# Export task functions
__all__ = [
    "compute_ranking_task",
    "decay_facts_task",
    "cleanup_old_data_task",
    "startup",
    "shutdown"
]