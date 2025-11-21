"""
RAG + CAG Service
Combines Retrieval-Augmented Generation (RAG) with Context-Augmented Generation (CAG)

RAG: Find relevant facts/documents from knowledge base
CAG: Apply rules, context, and personalization based on user/session state
"""
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from structlog import get_logger

from cc_core.services.embedding_service import EmbeddingService
from cc_core.analyzers.hybrid_bm25_dense import HybridBM25DenseAnalyzer
from cc_core.models.fact import Fact
from cc_core.mcp.extractor_server import ExtractorServer

logger = get_logger(__name__)


class RAGCAGService:
    """
    Unified service for RAG (Retrieval-Augmented Generation) + CAG (Context-Augmented Generation)
    
    RAG: Searches documents/facts and retrieves relevant information
    CAG: Applies rules, context, and personalization
    
    Together: RAG for truth (evidence), CAG for judgment (guardrails)
    """
    
    def __init__(
        self,
        embedding_service: Optional[EmbeddingService] = None,
        hybrid_ranker: Optional[HybridBM25DenseAnalyzer] = None,
        extractor: Optional[ExtractorServer] = None
    ):
        """
        Initialize RAG+CAG service
        
        Args:
            embedding_service: Service for creating embeddings
            hybrid_ranker: Hybrid BM25+Dense ranker for facts
            extractor: Fact extraction service
        """
        self.embedding_service = embedding_service or EmbeddingService()
        self.hybrid_ranker = hybrid_ranker or HybridBM25DenseAnalyzer()
        self.extractor = extractor or ExtractorServer()
        logger.info("Initialized RAG+CAG service")
    
    # ========================================================================
    # RAG: Retrieval-Augmented Generation
    # ========================================================================
    
    async def retrieve_facts(
        self,
        query: str,
        project_id: UUID,
        facts: List[Fact],
        top_k: int = 10,
        context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        RAG: Retrieve relevant facts using hybrid ranking
        
        Args:
            query: User query
            project_id: Project ID
            facts: List of facts to search
            top_k: Number of results to return
            context: Optional context (pagerank, decay scores)
            
        Returns:
            List of ranked facts with scores
        """
        if not facts:
            return []
        
        # Create query embedding
        query_embedding = await self.embedding_service.embed_text(query)
        
        # Compute hybrid scores
        scores = await self.hybrid_ranker.compute_scores(
            project_id=str(project_id),
            facts=facts,
            query_embedding=query_embedding,
            **(context or {})
        )
        
        # Sort by score and return top_k
        ranked = sorted(
            [
                {
                    "fact": fact,
                    "score": scores.get(fact.id, 0.0),
                    "source": "rag"
                }
                for fact in facts
            ],
            key=lambda x: x["score"],
            reverse=True
        )
        
        return ranked[:top_k]
    
    async def retrieve_chunks(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        RAG: Retrieve relevant document chunks using semantic search
        
        Args:
            query: User query
            chunks: List of document chunks with embeddings
            top_k: Number of results to return
            
        Returns:
            List of ranked chunks with similarity scores
        """
        if not chunks:
            return []
        
        # Create query embedding
        query_embedding = await self.embedding_service.embed_text(query)
        
        # Compute cosine similarity for each chunk
        ranked = []
        for chunk in chunks:
            if "embedding" in chunk and chunk["embedding"]:
                similarity = self.embedding_service.cosine_similarity(
                    query_embedding,
                    chunk["embedding"]
                )
                ranked.append({
                    "chunk": chunk,
                    "score": similarity,
                    "source": "rag"
                })
        
        # Sort by similarity
        ranked.sort(key=lambda x: x["score"], reverse=True)
        
        return ranked[:top_k]
    
    # ========================================================================
    # CAG: Context-Augmented Generation
    # ========================================================================
    
    async def apply_context_rules(
        self,
        results: List[Dict[str, Any]],
        user_context: Dict[str, Any],
        rules: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        CAG: Apply context and rules to filter/augment results
        
        Args:
            results: Retrieved facts/chunks from RAG
            user_context: User context (tier, region, permissions, etc.)
            rules: Optional rule set to apply
            
        Returns:
            Filtered and augmented results with CAG metadata
        """
        rules = rules or {}
        augmented = []
        
        for result in results:
            # Apply context-based filtering
            if not self._passes_context_filters(result, user_context, rules):
                continue
            
            # Add CAG metadata
            result["cag_metadata"] = {
                "user_tier": user_context.get("tier", "free"),
                "region": user_context.get("region", "global"),
                "timestamp": datetime.utcnow().isoformat(),
                "rules_applied": list(rules.keys()) if rules else []
            }
            
            # Apply personalization
            result["personalized_score"] = self._compute_personalized_score(
                result,
                user_context
            )
            
            augmented.append(result)
        
        # Re-sort by personalized score
        augmented.sort(key=lambda x: x.get("personalized_score", 0), reverse=True)
        
        return augmented
    
    def _passes_context_filters(
        self,
        result: Dict[str, Any],
        user_context: Dict[str, Any],
        rules: Dict[str, Any]
    ) -> bool:
        """
        Check if result passes context-based filters
        
        Examples:
        - Region-specific content
        - Tier-based access (free vs premium)
        - Time-based availability
        """
        # Example: Tier-based filtering
        if "min_tier" in rules:
            user_tier = user_context.get("tier", "free")
            tier_hierarchy = {"free": 0, "pro": 1, "enterprise": 2}
            min_tier = tier_hierarchy.get(rules["min_tier"], 0)
            current_tier = tier_hierarchy.get(user_tier, 0)
            if current_tier < min_tier:
                return False
        
        # Example: Region-based filtering
        if "allowed_regions" in rules:
            user_region = user_context.get("region", "global")
            if user_region not in rules["allowed_regions"] and "global" not in rules["allowed_regions"]:
                return False
        
        return True
    
    def _compute_personalized_score(
        self,
        result: Dict[str, Any],
        user_context: Dict[str, Any]
    ) -> float:
        """
        Compute personalized score based on user context
        
        Combines:
        - Base RAG score
        - User preferences
        - Historical interactions
        - Context relevance
        """
        base_score = result.get("score", 0.0)
        
        # Apply user preference boost (example)
        preference_boost = 0.0
        if "preferences" in user_context:
            # Check if result matches user preferences
            # This is a simplified example
            preference_boost = 0.1
        
        # Apply tier boost
        tier_boost = {
            "free": 0.0,
            "pro": 0.05,
            "enterprise": 0.1
        }.get(user_context.get("tier", "free"), 0.0)
        
        return base_score + preference_boost + tier_boost
    
    # ========================================================================
    # Fact Extraction (for document ingestion)
    # ========================================================================
    
    async def extract_and_rank_facts(
        self,
        text: str,
        project_id: UUID,
        source_type: str = "document",
        source_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract facts from text and rank them using hybrid model
        
        Args:
            text: Text to extract facts from
            project_id: Project ID
            source_type: Source type (document, url, user_input)
            source_id: Source identifier
            
        Returns:
            Dict with extracted and ranked facts
        """
        # Extract facts
        extraction_result = await self.extractor.call_tool(
            "extract_facts",
            {
                "text": text,
                "project_id": str(project_id),
                "source_type": source_type,
                "source_id": source_id or "unknown"
            }
        )
        
        facts = extraction_result.get("facts", [])
        
        if not facts:
            return {
                "facts": [],
                "ranked_facts": [],
                "count": 0
            }
        
        # Convert to Fact objects for ranking
        fact_objects = [
            Fact(
                id=f.get("id"),
                project_id=project_id,
                subject=f.get("subject", ""),
                predicate=f.get("predicate", ""),
                object=f.get("object", ""),
                context=f.get("context"),
                confidence=f.get("confidence", 0.5)
            )
            for f in facts
        ]
        
        # Rank facts using hybrid model
        scores = await self.hybrid_ranker.compute_scores(
            project_id=str(project_id),
            facts=fact_objects
        )
        
        # Combine facts with scores
        ranked_facts = sorted(
            [
                {
                    **f,
                    "rank_score": scores.get(fact_objects[i].id, 0.0)
                }
                for i, f in enumerate(facts)
            ],
            key=lambda x: x["rank_score"],
            reverse=True
        )
        
        return {
            "facts": facts,
            "ranked_facts": ranked_facts,
            "count": len(facts),
            "extraction_metadata": extraction_result.get("metadata", {})
        }
    
    # ========================================================================
    # Combined RAG + CAG Query
    # ========================================================================
    
    async def query(
        self,
        query: str,
        project_id: UUID,
        facts: List[Fact],
        chunks: Optional[List[Dict[str, Any]]] = None,
        user_context: Optional[Dict[str, Any]] = None,
        rules: Optional[Dict[str, Any]] = None,
        top_k: int = 10
    ) -> Dict[str, Any]:
        """
        Combined RAG + CAG query
        
        1. RAG: Retrieve relevant facts and chunks
        2. CAG: Apply context and rules
        3. Return unified results
        
        Args:
            query: User query
            project_id: Project ID
            facts: Available facts
            chunks: Optional document chunks
            user_context: User context (tier, region, etc.)
            rules: Optional rule set
            top_k: Number of results
            
        Returns:
            Dict with RAG results + CAG augmentation
        """
        user_context = user_context or {}
        
        # RAG: Retrieve facts
        fact_results = await self.retrieve_facts(
            query=query,
            project_id=project_id,
            facts=facts,
            top_k=top_k
        )
        
        # RAG: Retrieve chunks (if available)
        chunk_results = []
        if chunks:
            chunk_results = await self.retrieve_chunks(
                query=query,
                chunks=chunks,
                top_k=top_k // 2
            )
        
        # Combine RAG results
        all_results = fact_results + chunk_results
        
        # CAG: Apply context and rules
        augmented_results = await self.apply_context_rules(
            results=all_results,
            user_context=user_context,
            rules=rules
        )
        
        return {
            "query": query,
            "results": augmented_results,
            "count": len(augmented_results),
            "rag_metadata": {
                "facts_searched": len(facts),
                "chunks_searched": len(chunks) if chunks else 0,
                "retrieval_method": "hybrid_bm25_dense"
            },
            "cag_metadata": {
                "user_tier": user_context.get("tier", "free"),
                "rules_applied": list(rules.keys()) if rules else [],
                "personalization": "enabled" if user_context else "disabled"
            }
        }

