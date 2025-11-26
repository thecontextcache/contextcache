"""
Ranking service - orchestrates analyzer execution

Combines multiple signals for fact ranking:
- PageRank: Graph-based importance
- Time decay: Recency-based relevance
- KRL scores: Knowledge graph model fit (optional)
- Confidence: Extraction confidence

Final score = pagerank * decay * confidence * krl_score

Also provides graph-aware retrieval:
- Entity similarity search using KRL embeddings
- Neighborhood expansion for context augmentation
"""
from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID
import numpy as np
from structlog import get_logger

from cc_core.analyzers import PPRTimeDecayAnalyzer
from cc_core.storage import StorageAdapter
from cc_core.models.fact import Fact
from cc_core.models.entity import Entity
from cc_core.models.relation import Relation

logger = get_logger(__name__)


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
    
    async def rank_project(self, project_id: UUID, use_krl: bool = True) -> dict:
        """
        Compute rankings for all facts in a project.
        
        Combines PageRank, time decay, and optionally KRL scores.
        
        Args:
            project_id: Project UUID
            use_krl: Whether to incorporate KRL scores (if available)
            
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
        
        # Update database with combined scores
        # The final score combines: pagerank * decay * confidence * krl_score
        # If KRL is not available, it defaults to 1.0 (no effect)
        updated = 0
        krl_facts = 0
        
        for fact in facts:
            rank_score = pagerank_scores.get(fact.id, 0.0)
            decay_factor = decay_factors.get(fact.id, 1.0)
            
            # If fact has KRL score and we're using it, combine it
            # Otherwise, just update pagerank and decay
            if use_krl and fact.krl_score is not None:
                # KRL score already stored, just update other components
                krl_facts += 1
            
            success = await self.storage.update_fact_scores(
                fact_id=fact.id,
                rank_score=rank_score,
                decay_factor=decay_factor
            )
            if success:
                updated += 1
        
        result = {
            "project_id": str(project_id),
            "facts_ranked": updated,
            "algorithm": self.analyzer.name,
            "version": self.analyzer.version,
            "status": "completed"
        }
        
        if use_krl:
            result["krl_facts"] = krl_facts
            result["krl_enabled"] = True
        
        return result
    
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
    
    def compute_combined_score(
        self,
        fact: Fact,
        pagerank_score: Optional[float] = None,
        decay_factor: Optional[float] = None,
        use_krl: bool = True
    ) -> float:
        """
        Compute combined ranking score for a fact.
        
        Combines multiple signals:
        - PageRank score (graph importance)
        - Time decay factor (recency)
        - Extraction confidence
        - KRL score (knowledge graph model fit, optional)
        
        Formula:
            score = pagerank * decay * confidence * krl_score
        
        If any component is missing, it defaults to neutral (1.0 or fact default).
        
        Args:
            fact: Fact object
            pagerank_score: Override pagerank (uses fact.rank_score if None)
            decay_factor: Override decay (uses fact.decay_factor if None)
            use_krl: Whether to include KRL score in computation
            
        Returns:
            Combined score (0.0 to 1.0)
        """
        # Use provided scores or fall back to fact attributes
        pagerank = pagerank_score if pagerank_score is not None else fact.rank_score
        decay = decay_factor if decay_factor is not None else fact.decay_factor
        confidence = fact.confidence
        
        # Base score: pagerank * decay * confidence
        score = pagerank * decay * confidence
        
        # Optionally incorporate KRL score
        if use_krl and fact.krl_score is not None:
            score *= fact.krl_score
        
        return score
    
    def rank_facts_with_scores(
        self,
        facts: List[Fact],
        use_krl: bool = True,
        include_explanation: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Rank facts and return them with computed scores.
        
        Useful for query results where we want to show score breakdown.
        
        Args:
            facts: List of facts to rank
            use_krl: Whether to include KRL scores
            include_explanation: Whether to include score breakdown
            
        Returns:
            List of dicts with fact and scoring details, sorted by score descending
        """
        ranked = []
        
        for fact in facts:
            score = self.compute_combined_score(fact, use_krl=use_krl)
            
            result = {
                "fact": fact,
                "final_score": score
            }
            
            if include_explanation:
                result["explanation"] = {
                    "pagerank_score": fact.rank_score,
                    "decay_factor": fact.decay_factor,
                    "confidence": fact.confidence,
                    "krl_score": fact.krl_score if use_krl else None,
                    "formula": "pagerank * decay * confidence" + 
                              (" * krl_score" if use_krl and fact.krl_score else ""),
                    "computation": f"{fact.rank_score:.3f} * {fact.decay_factor:.3f} * "
                                  f"{fact.confidence:.3f}" + 
                                  (f" * {fact.krl_score:.3f}" if use_krl and fact.krl_score else "") +
                                  f" = {score:.3f}"
                }
            
            ranked.append(result)
        
        # Sort by final score descending
        ranked.sort(key=lambda x: x["final_score"], reverse=True)
        
        return ranked
    
    # ========================================================================
    # Graph-Aware Retrieval Methods
    # ========================================================================
    
    async def find_similar_entities_by_embedding(
        self,
        project_id: UUID,
        query_embedding: List[float],
        top_k: int = 10,
        min_similarity: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Find entities most similar to a query embedding using KRL embeddings.
        
        Algorithm:
        1. Retrieve all entities with KRL embeddings
        2. Compute cosine similarity between query and each entity
        3. Return top-k most similar entities above threshold
        
        This enables "semantic entity search" - find entities that are
        conceptually similar based on their position in the knowledge graph.
        
        Args:
            project_id: Project UUID
            query_embedding: Query vector (from EmbeddingService or KRL)
            top_k: Number of results to return
            min_similarity: Minimum cosine similarity threshold (0-1)
            
        Returns:
            List of dicts with entity and similarity score
        """
        # Get entities with KRL embeddings
        entities = await self.storage.get_entities_with_krl_embeddings(
            project_id=project_id,
            limit=1000  # TODO: Handle larger projects
        )
        
        if not entities:
            logger.warning(
                "No entities with KRL embeddings found",
                project_id=str(project_id)
            )
            return []
        
        # Compute similarities
        similarities = []
        query_vec = np.array(query_embedding, dtype=np.float32)
        query_norm = np.linalg.norm(query_vec)
        
        if query_norm == 0:
            logger.warning("Query embedding has zero norm")
            return []
        
        for entity in entities:
            if not entity.krl_embedding:
                continue
            
            entity_vec = np.array(entity.krl_embedding, dtype=np.float32)
            entity_norm = np.linalg.norm(entity_vec)
            
            if entity_norm == 0:
                continue
            
            # Cosine similarity
            similarity = float(
                np.dot(query_vec, entity_vec) / (query_norm * entity_norm)
            )
            
            if similarity >= min_similarity:
                similarities.append({
                    "entity": entity,
                    "similarity": similarity,
                    "source": "krl_embedding"
                })
        
        # Sort by similarity descending
        similarities.sort(key=lambda x: x["similarity"], reverse=True)
        
        logger.info(
            "Found similar entities",
            num_entities=len(similarities),
            top_similarity=similarities[0]["similarity"] if similarities else 0
        )
        
        return similarities[:top_k]
    
    async def expand_entity_neighborhood(
        self,
        entity_ids: List[UUID],
        max_depth: int = 1,
        max_neighbors: int = 50
    ) -> Dict[str, Any]:
        """
        Expand the graph neighborhood around entities.
        
        Algorithm:
        1. Start with seed entity IDs
        2. For each entity, fetch connected relations
        3. Collect neighbor entities (entities connected via relations)
        4. Optionally expand to depth-2 neighbors
        5. Return entities, relations, and summary statistics
        
        This provides "graph context" for RAG - entities and facts that
        are structurally connected in the knowledge graph.
        
        Args:
            entity_ids: List of seed entity UUIDs
            max_depth: How many hops to expand (1 or 2)
            max_neighbors: Max neighbors to include per entity
            
        Returns:
            Dict with:
            - entities: List of Entity objects
            - relations: List of Relation objects  
            - entity_map: Dict mapping UUID -> Entity
            - summary: Statistics about the neighborhood
        """
        if not entity_ids:
            return {
                "entities": [],
                "relations": [],
                "entity_map": {},
                "summary": {"num_entities": 0, "num_relations": 0}
            }
        
        # Track visited entities and relations to avoid duplicates
        visited_entities: Dict[UUID, Entity] = {}
        visited_relations: Dict[UUID, Relation] = {}
        
        # Queue for BFS-style expansion
        current_level = list(entity_ids)
        
        for depth in range(max_depth):
            next_level = []
            
            for entity_id in current_level:
                # Skip if already visited
                if entity_id in visited_entities:
                    continue
                
                # Fetch entity
                entity = await self.storage.get_entity(entity_id)
                if not entity:
                    continue
                
                visited_entities[entity_id] = entity
                
                # Fetch relations for this entity
                relations = await self.storage.get_relations_for_entity(
                    entity_id=entity_id,
                    limit=max_neighbors
                )
                
                # Process each relation
                for relation in relations[:max_neighbors]:
                    # Store relation
                    if relation.id not in visited_relations:
                        visited_relations[relation.id] = relation
                    
                    # Add neighbor entities to next level
                    if relation.subject_id != entity_id:
                        next_level.append(relation.subject_id)
                    if relation.object_id != entity_id:
                        next_level.append(relation.object_id)
            
            # Move to next level
            current_level = list(set(next_level))  # Deduplicate
            
            if not current_level:
                break  # No more entities to expand
        
        result = {
            "entities": list(visited_entities.values()),
            "relations": list(visited_relations.values()),
            "entity_map": visited_entities,
            "summary": {
                "num_entities": len(visited_entities),
                "num_relations": len(visited_relations),
                "seed_entities": len(entity_ids),
                "depth_expanded": max_depth
            }
        }
        
        logger.info(
            "Expanded entity neighborhood",
            seed_entities=len(entity_ids),
            total_entities=len(visited_entities),
            total_relations=len(visited_relations)
        )
        
        return result
    
    async def retrieve_graph_context_for_query(
        self,
        project_id: UUID,
        query_embedding: List[float],
        top_k_entities: int = 5,
        expand_depth: int = 1,
        min_similarity: float = 0.3
    ) -> Dict[str, Any]:
        """
        Combined graph retrieval for query augmentation.
        
        High-level workflow:
        1. Find top-k entities similar to query (using KRL embeddings)
        2. Expand neighborhood around those entities
        3. Format as graph context snippets
        4. Return structured data ready for RAG fusion
        
        This is the main entry point for graph-aware retrieval.
        Use this in the RAG pipeline to enrich context with graph structure.
        
        Args:
            project_id: Project UUID
            query_embedding: Query embedding vector
            top_k_entities: Number of similar entities to find
            expand_depth: How many hops to expand neighbors
            min_similarity: Minimum entity similarity threshold
            
        Returns:
            Dict with:
            - matched_entities: Entities matching the query
            - expanded_graph: Full neighborhood expansion
            - context_snippets: Formatted text snippets for LLM
            - metadata: Statistics and explanations
        """
        logger.info(
            "Retrieving graph context for query",
            project_id=str(project_id),
            top_k_entities=top_k_entities
        )
        
        # Step 1: Find similar entities
        similar_entities = await self.find_similar_entities_by_embedding(
            project_id=project_id,
            query_embedding=query_embedding,
            top_k=top_k_entities,
            min_similarity=min_similarity
        )
        
        if not similar_entities:
            logger.info("No similar entities found for query")
            return {
                "matched_entities": [],
                "expanded_graph": {"entities": [], "relations": []},
                "context_snippets": [],
                "metadata": {
                    "num_matched_entities": 0,
                    "num_expanded_entities": 0,
                    "num_relations": 0
                }
            }
        
        # Step 2: Expand neighborhood
        entity_ids = [item["entity"].id for item in similar_entities]
        expanded_graph = await self.expand_entity_neighborhood(
            entity_ids=entity_ids,
            max_depth=expand_depth,
            max_neighbors=20
        )
        
        # Step 3: Format context snippets
        context_snippets = self._format_graph_context_snippets(
            matched_entities=similar_entities,
            expanded_graph=expanded_graph
        )
        
        result = {
            "matched_entities": similar_entities,
            "expanded_graph": expanded_graph,
            "context_snippets": context_snippets,
            "metadata": {
                "num_matched_entities": len(similar_entities),
                "num_expanded_entities": expanded_graph["summary"]["num_entities"],
                "num_relations": expanded_graph["summary"]["num_relations"],
                "query_embedding_dim": len(query_embedding),
                "expansion_depth": expand_depth
            }
        }
        
        logger.info(
            "Retrieved graph context",
            num_matched_entities=len(similar_entities),
            num_expanded_entities=len(expanded_graph["entities"])
        )
        
        return result
    
    def _format_graph_context_snippets(
        self,
        matched_entities: List[Dict[str, Any]],
        expanded_graph: Dict[str, Any]
    ) -> List[str]:
        """
        Format graph context as text snippets for LLM consumption.
        
        Creates human-readable descriptions of entities and their relationships.
        These can be injected into the RAG context.
        
        Args:
            matched_entities: Entities matching the query with similarity scores
            expanded_graph: Expanded neighborhood with entities and relations
            
        Returns:
            List of formatted text snippets
        """
        snippets = []
        entity_map = expanded_graph["entity_map"]
        
        # Add matched entities with similarity scores
        snippets.append("## Relevant Entities (by semantic similarity):")
        for item in matched_entities[:5]:  # Top 5 only
            entity = item["entity"]
            similarity = item["similarity"]
            snippets.append(
                f"- {entity.name} (type: {entity.entity_type}, "
                f"similarity: {similarity:.2f})"
            )
        
        # Add relationships
        if expanded_graph["relations"]:
            snippets.append("\n## Entity Relationships:")
            for rel in expanded_graph["relations"][:20]:  # Limit to 20
                subject = entity_map.get(rel.subject_id)
                obj = entity_map.get(rel.object_id)
                
                if subject and obj:
                    snippets.append(
                        f"- {subject.name} --[{rel.predicate}]--> {obj.name} "
                        f"(confidence: {rel.confidence:.2f})"
                    )
        
        return snippets