"""
Personalized PageRank with Time Decay analyzer
"""
import math
from typing import Dict, List
from uuid import UUID
from datetime import datetime, timezone

import networkx as nx

from cc_core.analyzers.base import Analyzer
from cc_core.models import Fact


class PPRTimeDecayAnalyzer(Analyzer):
    """
    Default ranking analyzer using Personalized PageRank + Time Decay.
    
    Algorithm:
    1. Build graph from facts (entities as nodes, predicates as edges)
    2. Run Personalized PageRank with damping factor 0.85
    3. Apply exponential time decay (half-life = 90 days)
    4. Final score = pagerank * decay_factor * confidence
    """
    
    def __init__(
        self,
        damping: float = 0.85,
        max_iter: int = 100,
        tolerance: float = 1e-6,
        decay_half_life_days: int = 90
    ):
        """
        Initialize PPR + Time Decay analyzer.
        
        Args:
            damping: PageRank damping factor (0.85 standard)
            max_iter: Max iterations for PageRank convergence
            tolerance: Convergence tolerance
            decay_half_life_days: Half-life for time decay in days
        """
        super().__init__(name="ppr_time_decay", version="0.1.0")
        self.damping = damping
        self.max_iter = max_iter
        self.tolerance = tolerance
        self.decay_half_life_days = decay_half_life_days
    
    async def compute_scores(
        self,
        project_id: UUID,
        facts: List[Fact]
    ) -> Dict[UUID, float]:
        """
        Compute PageRank scores for facts.
        
        Builds a graph where:
        - Nodes = unique entities (subjects + objects)
        - Edges = predicates (weighted by confidence)
        - PageRank = importance propagation through graph
        """
        if not facts:
            return {}
        
        # Build graph
        G = nx.DiGraph()
        
        # Add nodes and edges from facts
        for fact in facts:
            # Add subject and object as nodes
            G.add_node(fact.subject)
            G.add_node(fact.object)
            
            # Add edge with weight = confidence
            G.add_edge(
                fact.subject,
                fact.object,
                weight=fact.confidence,
                predicate=fact.predicate
            )
        
        # Compute PageRank
        try:
            pagerank = nx.pagerank(
                G,
                alpha=self.damping,
                max_iter=self.max_iter,
                tol=self.tolerance,
                weight='weight'
            )
        except nx.PowerIterationFailedConvergence:
            # Fallback: equal scores if doesn't converge
            pagerank = {node: 1.0 / len(G.nodes()) for node in G.nodes()}
        
        # Map PageRank scores back to facts
        # Fact score = average of subject and object PageRank
        fact_scores = {}
        for fact in facts:
            subject_score = pagerank.get(fact.subject, 0.0)
            object_score = pagerank.get(fact.object, 0.0)
            
            # Average score
            fact_scores[fact.id] = (subject_score + object_score) / 2.0
        
        return fact_scores
    
    async def apply_decay(
        self,
        project_id: UUID,
        facts: List[Fact]
    ) -> Dict[UUID, float]:
        """
        Apply exponential time decay to facts.
        
        Formula: decay_factor = exp(-λ * days_old)
        Where λ = ln(2) / half_life
        
        This means:
        - At 0 days: decay_factor = 1.0 (100%)
        - At 90 days (half-life): decay_factor = 0.5 (50%)
        - At 180 days: decay_factor = 0.25 (25%)
        """
        if not facts:
            return {}
        
        now = datetime.now(timezone.utc)
        lambda_decay = math.log(2) / self.decay_half_life_days
        
        decay_factors = {}
        for fact in facts:
            days_old = (now - fact.created_at).total_seconds() / (24 * 60 * 60)
            decay_factors[fact.id] = math.exp(-lambda_decay * days_old)
        
        return decay_factors