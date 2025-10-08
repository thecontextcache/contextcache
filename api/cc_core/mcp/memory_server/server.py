"""
MCP Memory Server - Knowledge graph storage and retrieval
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, text
from cc_core.models.chunk import DocumentChunkDB
from cc_core.services.embedding_service import EmbeddingService
from datetime import datetime
import hashlib


class MemoryServer:
    """
    MCP Server for memory/knowledge graph operations
    Stores and retrieves facts with semantic search
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.embedding_service = EmbeddingService()
    
    async def store_fact(
        self,
        subject: str,
        predicate: str,
        obj: str,
        context: str,
        confidence: float,
        document_id: str,
        provenance: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Store a fact in the knowledge graph
        
        MCP Tool: store_fact
        """
        # Generate embedding for the fact
        fact_text = f"{subject} {predicate} {obj}"
        embedding = self.embedding_service.embed_text(fact_text)
        
        # Create chunk record (reusing document_chunks table for facts)
        chunk = DocumentChunkDB(
            document_id=document_id,
            chunk_index=0,  # Will be updated with proper indexing
            text=f"{subject} --[{predicate}]--> {obj}\nContext: {context}",
            embedding=embedding,
            start_offset=0,
            end_offset=len(context)
        )
        
        self.db.add(chunk)
        await self.db.commit()
        await self.db.refresh(chunk)
        
        return {
            "fact_id": str(chunk.id),
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "confidence": confidence,
            "stored_at": chunk.created_at.isoformat()
        }
    
    async def query_facts(
        self,
        query: str,
        project_id: str,
        limit: int = 10,
        min_similarity: float = 0.2
    ) -> List[Dict[str, Any]]:
        """
        Query facts using semantic search
        
        MCP Tool: query_facts
        """
        # Create query embedding
        query_embedding = self.embedding_service.embed_text(query)
        
        # Search using pgvector
        from cc_core.models.document import DocumentDB
        
        result = await self.db.execute(
            select(
                DocumentChunkDB,
                DocumentDB.source_url,
                (1 - DocumentChunkDB.embedding.cosine_distance(query_embedding)).label('similarity')
            )
            .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
            .where(DocumentDB.project_id == project_id)
            .where(text('1 - (embedding <=> :embedding) > :min_sim'))
            .params(embedding=str(query_embedding), min_sim=min_similarity)
            .order_by(text('similarity DESC'))
            .limit(limit)
        )
        
        facts = []
        for chunk, source_url, similarity in result:
            # Parse fact from text (simple parser)
            fact_parts = chunk.text.split('--[')
            if len(fact_parts) >= 2:
                subject = fact_parts[0].strip()
                rest = fact_parts[1].split(']-->')
                predicate = rest[0].strip() if len(rest) > 0 else "relates_to"
                obj = rest[1].split('\n')[0].strip() if len(rest) > 1 else ""
            else:
                subject = "Unknown"
                predicate = "contains"
                obj = chunk.text[:100]
            
            facts.append({
                "fact_id": str(chunk.id),
                "subject": subject,
                "predicate": predicate,
                "object": obj,
                "context": chunk.text,
                "similarity": float(similarity),
                "source": source_url
            })
        
        return facts
    
    async def get_related_facts(
        self,
        entity: str,
        project_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get all facts related to an entity
        
        MCP Tool: get_related_facts
        """
        return await self.query_facts(
            query=entity,
            project_id=project_id,
            limit=limit,
            min_similarity=0.3
        )
    
    async def count_facts(self, project_id: str) -> int:
        """
        Count total facts in project
        
        MCP Tool: count_facts
        """
        from cc_core.models.document import DocumentDB
        
        result = await self.db.execute(
            select(func.count())
            .select_from(DocumentChunkDB)
            .join(DocumentDB, DocumentChunkDB.document_id == DocumentDB.id)
            .where(DocumentDB.project_id == project_id)
        )
        return result.scalar() or 0
    
    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        """Return MCP tool definitions"""
        return [
            {
                "name": "store_fact",
                "description": "Store a structured fact in the knowledge graph",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "subject": {"type": "string"},
                        "predicate": {"type": "string"},
                        "object": {"type": "string"},
                        "context": {"type": "string"},
                        "confidence": {"type": "number"},
                        "document_id": {"type": "string"},
                        "provenance": {"type": "object"}
                    },
                    "required": ["subject", "predicate", "object", "context", "document_id"]
                }
            },
            {
                "name": "query_facts",
                "description": "Query facts using semantic search",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "project_id": {"type": "string"},
                        "limit": {"type": "integer", "default": 10},
                        "min_similarity": {"type": "number", "default": 0.2}
                    },
                    "required": ["query", "project_id"]
                }
            },
            {
                "name": "get_related_facts",
                "description": "Get all facts related to a specific entity",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "entity": {"type": "string"},
                        "project_id": {"type": "string"},
                        "limit": {"type": "integer", "default": 10}
                    },
                    "required": ["entity", "project_id"]
                }
            },
            {
                "name": "count_facts",
                "description": "Count total facts in a project",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"}
                    },
                    "required": ["project_id"]
                }
            }
        ]