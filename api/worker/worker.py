"""
Background worker for async ranking jobs
"""
import asyncio
from uuid import UUID

from cc_core.analyzers import PPRTimeDecayAnalyzer
from cc_core.storage import PostgresAdapter


async def rank_facts_job(project_id: str, storage_url: str, encryption_key: bytes):
    """
    Background job to compute fact rankings.
    
    Args:
        project_id: Project UUID as string
        storage_url: Database connection URL
        encryption_key: Encryption key for storage
    """
    project_uuid = UUID(project_id)
    
    # Initialize storage and analyzer
    storage = PostgresAdapter(storage_url, encryption_key)
    await storage.connect()
    
    analyzer = PPRTimeDecayAnalyzer()
    
    try:
        # Fetch all facts for project
        facts = await storage.list_facts(project_uuid, limit=10000)
        
        if not facts:
            print(f"No facts found for project {project_id}")
            return
        
        # Compute PageRank scores
        pagerank_scores = await analyzer.compute_scores(project_uuid, facts)
        
        # Compute decay factors
        decay_factors = await analyzer.apply_decay(project_uuid, facts)
        
        # Update scores in database
        for fact in facts:
            rank_score = pagerank_scores.get(fact.id, 0.0)
            decay_factor = decay_factors.get(fact.id, 1.0)
            
            await storage.update_fact_scores(
                fact_id=fact.id,
                rank_score=rank_score,
                decay_factor=decay_factor
            )
        
        print(f"✅ Ranked {len(facts)} facts for project {project_id}")
        
    finally:
        await storage.disconnect()


async def apply_decay_job(project_id: str, storage_url: str, encryption_key: bytes):
    """
    Background job to apply time decay to fact scores.
    
    Args:
        project_id: Project UUID as string
        storage_url: Database connection URL
        encryption_key: Encryption key for storage
    """
    project_uuid = UUID(project_id)
    
    storage = PostgresAdapter(storage_url, encryption_key)
    await storage.connect()
    
    analyzer = PPRTimeDecayAnalyzer()
    
    try:
        facts = await storage.list_facts(project_uuid, limit=10000)
        
        if not facts:
            return
        
        decay_factors = await analyzer.apply_decay(project_uuid, facts)
        
        for fact in facts:
            await storage.update_fact_scores(
                fact_id=fact.id,
                decay_factor=decay_factors.get(fact.id, 1.0)
            )
        
        print(f"✅ Applied decay to {len(facts)} facts for project {project_id}")
        
    finally:
        await storage.disconnect()


# Simple worker entry point for development
# In production, use Arq or RQ for proper job queue
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 4:
        print("Usage: python worker.py <job_type> <project_id> <storage_url>")
        sys.exit(1)
    
    job_type = sys.argv[1]
    project_id = sys.argv[2]
    storage_url = sys.argv[3]
    encryption_key = b'test_key_32_bytes_for_dev_only!!'  # TODO: Load from env
    
    if job_type == "rank":
        asyncio.run(rank_facts_job(project_id, storage_url, encryption_key))
    elif job_type == "decay":
        asyncio.run(apply_decay_job(project_id, storage_url, encryption_key))
    else:
        print(f"Unknown job type: {job_type}")
        sys.exit(1)