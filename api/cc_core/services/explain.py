"""
Explain service - provides query explanations and retrieval insights
"""
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime

from cc_core.services.embedding_service import EmbeddingService
from cc_core.storage import StorageAdapter


class ExplainService:
    """
    Service for explaining query results and retrieval decisions.
    Provides transparency into ranking, relevance, and retrieval process.
    """
    
    def __init__(self, storage: StorageAdapter):
        """
        Initialize explain service.
        
        Args:
            storage: Storage adapter instance
        """
        self.storage = storage
        self.embed_service = EmbeddingService()
    
    async def explain_query(
        self,
        project_id: UUID,
        query: str,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Explain how a query retrieves and ranks results.
        
        Args:
            project_id: Project UUID
            query: Query text
            limit: Number of results to retrieve
            
        Returns:
            Dict with explanation details
        """
        start_time = datetime.utcnow()
        
        # Generate query embedding
        query_embedding = self.embed_service.embed_text(query)
        embed_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Retrieve results with scores
        retrieval_start = datetime.utcnow()
        results = await self.storage.search_chunks(
            project_id=project_id,
            query_embedding=query_embedding,
            limit=limit * 2  # Get more for diversity analysis
        )
        retrieval_time = (datetime.utcnow() - retrieval_start).total_seconds()
        
        if not results:
            return {
                "query": query,
                "status": "no_results",
                "explanation": "No matching documents found",
                "timing": {
                    "embedding": embed_time,
                    "retrieval": retrieval_time,
                    "total": embed_time + retrieval_time
                }
            }
        
        # Analyze results
        analysis = self._analyze_results(results[:limit], query)
        
        # Calculate diversity
        diversity = self._calculate_diversity(results[:limit])
        
        # Build explanation
        explanation = {
            "query": query,
            "query_embedding_time": f"{embed_time:.3f}s",
            "retrieval_time": f"{retrieval_time:.3f}s",
            "results_count": len(results[:limit]),
            "candidates_evaluated": len(results),
            
            "ranking_explanation": {
                "algorithm": "cosine_similarity",
                "description": "Results ranked by semantic similarity to query",
                "score_range": {
                    "highest": round(analysis["max_score"], 4),
                    "lowest": round(analysis["min_score"], 4),
                    "average": round(analysis["avg_score"], 4)
                }
            },
            
            "diversity_metrics": {
                "score": round(diversity["score"], 4),
                "description": diversity["description"],
                "unique_documents": diversity["unique_docs"]
            },
            
            "query_analysis": {
                "length": len(query),
                "tokens": len(query.split()),
                "embedding_dimension": 384  # MiniLM dimension
            },
            
            "results": [
                {
                    "rank": i + 1,
                    "chunk_id": str(r["chunk_id"]),
                    "document_id": str(r["document_id"]),
                    "similarity_score": round(r["similarity"], 4),
                    "text_preview": r["text"][:200] + "..." if len(r["text"]) > 200 else r["text"],
                    "source": r.get("source_url", "Unknown"),
                    "explanation": self._explain_match(query, r, i + 1)
                }
                for i, r in enumerate(results[:limit])
            ],
            
            "timing": {
                "embedding": f"{embed_time:.3f}s",
                "retrieval": f"{retrieval_time:.3f}s",
                "total": f"{(embed_time + retrieval_time):.3f}s"
            }
        }
        
        return explanation
    
    async def explain_chunk(
        self,
        chunk_id: UUID,
        project_id: UUID
    ) -> Dict[str, Any]:
        """
        Explain how a specific chunk was indexed and ranked.
        
        Args:
            chunk_id: Chunk UUID
            project_id: Project UUID
            
        Returns:
            Dict with chunk explanation
        """
        # Get chunk details
        chunk = await self.storage.get_chunk(chunk_id)
        if not chunk:
            return {
                "status": "not_found",
                "error": "Chunk not found"
            }
        
        # Get document details
        document = await self.storage.get_document(chunk.document_id)
        
        # Get fact scores if available
        scores = await self.storage.get_fact_scores(chunk_id)
        
        # Analyze embedding
        embedding_stats = self._analyze_embedding(chunk.embedding)
        
        return {
            "chunk_id": str(chunk_id),
            "document_id": str(chunk.document_id),
            "chunk_index": chunk.chunk_index,
            
            "content": {
                "text": chunk.text,
                "length": len(chunk.text),
                "start_offset": chunk.start_offset,
                "end_offset": chunk.end_offset
            },
            
            "document_info": {
                "source_type": document.source_type,
                "source_url": document.source_url,
                "created_at": document.created_at.isoformat()
            },
            
            "embedding_analysis": embedding_stats,
            
            "ranking_scores": {
                "pagerank_score": scores.get("rank_score", 0.0) if scores else 0.0,
                "decay_factor": scores.get("decay_factor", 1.0) if scores else 1.0,
                "final_score": (scores.get("rank_score", 0.0) * scores.get("decay_factor", 1.0)) if scores else 0.0,
                "explanation": "Final score = PageRank × Time Decay Factor"
            },
            
            "indexing_info": {
                "indexed_at": chunk.created_at.isoformat(),
                "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
                "embedding_dimension": len(chunk.embedding)
            }
        }
    
    async def compare_queries(
        self,
        project_id: UUID,
        query1: str,
        query2: str
    ) -> Dict[str, Any]:
        """
        Compare two queries and explain their differences.
        
        Args:
            project_id: Project UUID
            query1: First query
            query2: Second query
            
        Returns:
            Dict with comparison analysis
        """
        # Generate embeddings
        emb1 = self.embed_service.embed_text(query1)
        emb2 = self.embed_service.embed_text(query2)
        
        # Calculate semantic similarity
        similarity = self._cosine_similarity(emb1, emb2)
        
        # Get results for both queries
        results1 = await self.storage.search_chunks(project_id, emb1, limit=10)
        results2 = await self.storage.search_chunks(project_id, emb2, limit=10)
        
        # Find overlap
        ids1 = set(r["chunk_id"] for r in results1)
        ids2 = set(r["chunk_id"] for r in results2)
        overlap = len(ids1 & ids2)
        
        return {
            "query1": query1,
            "query2": query2,
            
            "semantic_similarity": {
                "score": round(similarity, 4),
                "interpretation": self._interpret_similarity(similarity)
            },
            
            "results_comparison": {
                "query1_results": len(results1),
                "query2_results": len(results2),
                "overlap": overlap,
                "overlap_percentage": round((overlap / max(len(results1), 1)) * 100, 1),
                "unique_to_query1": len(ids1 - ids2),
                "unique_to_query2": len(ids2 - ids1)
            },
            
            "recommendations": self._generate_recommendations(
                similarity,
                overlap,
                len(results1),
                len(results2)
            )
        }
    
    def _analyze_results(self, results: List[Dict], query: str) -> Dict[str, float]:
        """Analyze result set for statistics."""
        if not results:
            return {"max_score": 0.0, "min_score": 0.0, "avg_score": 0.0}
        
        scores = [r["similarity"] for r in results]
        return {
            "max_score": max(scores),
            "min_score": min(scores),
            "avg_score": sum(scores) / len(scores)
        }
    
    def _calculate_diversity(self, results: List[Dict]) -> Dict[str, Any]:
        """Calculate diversity of results."""
        if not results:
            return {"score": 0.0, "description": "No results", "unique_docs": 0}
        
        unique_docs = len(set(r["document_id"] for r in results))
        diversity_score = unique_docs / len(results)
        
        if diversity_score >= 0.8:
            description = "High diversity - results from many different documents"
        elif diversity_score >= 0.5:
            description = "Moderate diversity - results from several documents"
        else:
            description = "Low diversity - results concentrated in few documents"
        
        return {
            "score": diversity_score,
            "description": description,
            "unique_docs": unique_docs
        }
    
    def _explain_match(self, query: str, result: Dict, rank: int) -> str:
        """Generate explanation for why a result matched."""
        score = result["similarity"]
        
        if score >= 0.8:
            return f"Rank #{rank}: Very strong semantic match (score: {score:.4f})"
        elif score >= 0.6:
            return f"Rank #{rank}: Good semantic match (score: {score:.4f})"
        elif score >= 0.4:
            return f"Rank #{rank}: Moderate semantic match (score: {score:.4f})"
        else:
            return f"Rank #{rank}: Weak semantic match (score: {score:.4f})"
    
    def _analyze_embedding(self, embedding: List[float]) -> Dict[str, Any]:
        """Analyze embedding vector characteristics."""
        import math
        
        # Calculate statistics
        mean = sum(embedding) / len(embedding)
        variance = sum((x - mean) ** 2 for x in embedding) / len(embedding)
        std_dev = math.sqrt(variance)
        
        # Calculate L2 norm
        l2_norm = math.sqrt(sum(x ** 2 for x in embedding))
        
        return {
            "dimension": len(embedding),
            "statistics": {
                "mean": round(mean, 6),
                "std_dev": round(std_dev, 6),
                "l2_norm": round(l2_norm, 6)
            },
            "description": "Vector representation in 384-dimensional semantic space"
        }
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        import math
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a ** 2 for a in vec1))
        norm2 = math.sqrt(sum(b ** 2 for b in vec2))
        
        return dot_product / (norm1 * norm2) if norm1 and norm2 else 0.0
    
    def _interpret_similarity(self, score: float) -> str:
        """Interpret similarity score."""
        if score >= 0.9:
            return "Nearly identical queries"
        elif score >= 0.7:
            return "Very similar queries"
        elif score >= 0.5:
            return "Moderately similar queries"
        elif score >= 0.3:
            return "Somewhat related queries"
        else:
            return "Different queries"
    
    def _generate_recommendations(
        self,
        similarity: float,
        overlap: int,
        count1: int,
        count2: int
    ) -> List[str]:
        """Generate recommendations based on comparison."""
        recommendations = []
        
        if similarity > 0.8 and overlap < 0.5 * max(count1, count2):
            recommendations.append(
                "Queries are semantically similar but return different results. "
                "Consider using more specific terms."
            )
        
        if similarity < 0.3 and overlap > 0.5 * max(count1, count2):
            recommendations.append(
                "Queries are semantically different but return similar results. "
                "The document corpus may be too narrow."
            )
        
        if count1 == 0 or count2 == 0:
            recommendations.append(
                "One query returns no results. Try rephrasing or adding more documents."
            )
        
        if not recommendations:
            recommendations.append("Query comparison looks good!")
        
        return recommendations
