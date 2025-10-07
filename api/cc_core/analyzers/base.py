"""
Base analyzer interface for ranking algorithms
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Any
from uuid import UUID

from cc_core.models import Fact


class Analyzer(ABC):
    """
    Abstract base class for ranking analyzers.
    
    Analyzers compute scores for facts based on various algorithms
    (PageRank, novelty detection, time decay, etc.)
    """
    
    def __init__(self, name: str, version: str = "0.1.0"):
        """
        Initialize analyzer.
        
        Args:
            name: Analyzer name
            version: Algorithm version
        """
        self.name = name
        self.version = version
    
    @abstractmethod
    async def compute_scores(
        self,
        project_id: UUID,
        facts: List[Fact]
    ) -> Dict[UUID, float]:
        """
        Compute ranking scores for facts.
        
        Args:
            project_id: Project UUID
            facts: List of facts to rank
            
        Returns:
            Dict mapping fact_id to score (0.0 to 1.0)
        """
        pass
    
    @abstractmethod
    async def apply_decay(
        self,
        project_id: UUID,
        facts: List[Fact]
    ) -> Dict[UUID, float]:
        """
        Apply time-based decay to fact scores.
        
        Args:
            project_id: Project UUID
            facts: List of facts
            
        Returns:
            Dict mapping fact_id to decay_factor (0.0 to 1.0)
        """
        pass
    
    def get_info(self) -> Dict[str, str]:
        """Get analyzer metadata."""
        return {
            "name": self.name,
            "version": self.version
        }