"""
Ranking service - orchestrates analyzer execution
"""
from typing import Optional
from uuid import UUID

from cc_core.analyzers import PPRTimeDecayAnalyzer
from cc_core.storage import StorageAdapter


class RankingService:
    """
    Service for computing and updating fact rankings.
    """
    
    def __init__(self, storage: StorageAdapter):
        """
        Initialize ranking service.
        
        Args:
            storage: Storage adapter instance
        """
        self.storage = storage
        self.analyzer = PPRTimeDecayAnalyzer()
    
    async def rank_project(self, project_id: UUID) -> dict:
        """
        Compute rankings for all facts in a project.
        
        Args:
            project_id: Project UUID
            
        Returns:
            Dict with ranking results
        """
        
        # Fetch all facts
        # TODO(v0.2.0): Implement pagination for projects with >10K facts
        facts = await self.storage.list_facts(project_id, limit=10000)
        
        if not facts:
            return {
                "project_id": str(project_id),
                "facts_ranked": 0,
                "status": "no_facts"
            }
        
        # Compute scores
        pagerank_scores = await self.analyzer.compute_scores(project_id, facts)
        decay_factors = await self.analyzer.apply_decay(project_id, facts)
        
        # Update database
        updated = 0
        for fact in facts:
            rank_score = pagerank_scores.get(fact.id, 0.0)
            decay_factor = decay_factors.get(fact.id, 1.0)
            
            success = await self.storage.update_fact_scores(
                fact_id=fact.id,
                rank_score=rank_score,
                decay_factor=decay_factor
            )
            if success:
                updated += 1
        
        return {
            "project_id": str(project_id),
            "facts_ranked": updated,
            "algorithm": self.analyzer.name,
            "version": self.analyzer.version,
            "status": "completed"
        }
    
    async def apply_decay(self, project_id: UUID) -> dict:
        """
        Apply time decay to all facts in a project.
        
        Args:
            project_id: Project UUID
            
        Returns:
            Dict with decay results
        """
        # TODO(v0.2.0): Implement pagination for projects with >10K facts
        facts = await self.storage.list_facts(project_id, limit=10000)
        
        if not facts:
            return {
                "project_id": str(project_id),
                "facts_updated": 0,
                "status": "no_facts"
            }
        
        decay_factors = await self.analyzer.apply_decay(project_id, facts)
        
        updated = 0
        for fact in facts:
            success = await self.storage.update_fact_scores(
                fact_id=fact.id,
                decay_factor=decay_factors.get(fact.id, 1.0)
            )
            if success:
                updated += 1
        
        return {
            "project_id": str(project_id),
            "facts_updated": updated,
            "status": "completed"
        }