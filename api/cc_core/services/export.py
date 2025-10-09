"""
Export service - handles bulk data export in various formats
"""
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
import json
import csv
from io import StringIO

from cc_core.storage import StorageAdapter


class ExportService:
    """
    Service for exporting project data in various formats.
    Supports JSON, CSV, and Markdown exports.
    """
    
    def __init__(self, storage: StorageAdapter):
        """
        Initialize export service.
        
        Args:
            storage: Storage adapter instance
        """
        self.storage = storage
    
    async def export_project(
        self,
        project_id: UUID,
        format: str = "json",
        include_embeddings: bool = False,
        include_metadata: bool = True
    ) -> Dict[str, Any]:
        """
        Export entire project data.
        
        Args:
            project_id: Project UUID
            format: Export format (json, csv, markdown)
            include_embeddings: Whether to include embedding vectors
            include_metadata: Whether to include metadata
            
        Returns:
            Dict with export data and metadata
        """
        # Get project details
        project = await self.storage.get_project(project_id)
        if not project:
            return {
                "status": "error",
                "error": "Project not found"
            }
        
        # Get all documents
        documents = await self.storage.list_documents(project_id, limit=10000)
        
        # Get all chunks
        chunks = await self.storage.list_chunks(project_id, limit=100000)
        
        # Format data based on requested format
        if format == "json":
            data = self._export_json(
                project,
                documents,
                chunks,
                include_embeddings,
                include_metadata
            )
        elif format == "csv":
            data = self._export_csv(
                project,
                documents,
                chunks,
                include_metadata
            )
        elif format == "markdown":
            data = self._export_markdown(
                project,
                documents,
                chunks,
                include_metadata
            )
        else:
            return {
                "status": "error",
                "error": f"Unsupported format: {format}"
            }
        
        return {
            "status": "success",
            "project_id": str(project_id),
            "project_name": project.name,
            "format": format,
            "export_time": datetime.utcnow().isoformat(),
            "statistics": {
                "documents": len(documents),
                "chunks": len(chunks),
                "size_bytes": len(json.dumps(data).encode('utf-8'))
            },
            "data": data
        }
    
    async def export_document(
        self,
        document_id: UUID,
        format: str = "json",
        include_embeddings: bool = False
    ) -> Dict[str, Any]:
        """
        Export single document with its chunks.
        
        Args:
            document_id: Document UUID
            format: Export format
            include_embeddings: Whether to include embeddings
            
        Returns:
            Dict with export data
        """
        # Get document
        document = await self.storage.get_document(document_id)
        if not document:
            return {
                "status": "error",
                "error": "Document not found"
            }
        
        # Get chunks
        chunks = await self.storage.list_document_chunks(document_id)
        
        if format == "json":
            data = {
                "document": {
                    "id": str(document.id),
                    "source_type": document.source_type,
                    "source_url": document.source_url,
                    "status": document.status,
                    "created_at": document.created_at.isoformat(),
                    "processed_at": document.processed_at.isoformat() if document.processed_at else None
                },
                "chunks": [
                    {
                        "id": str(c.id),
                        "chunk_index": c.chunk_index,
                        "text": c.text,
                        "start_offset": c.start_offset,
                        "end_offset": c.end_offset,
                        **({"embedding": c.embedding} if include_embeddings else {})
                    }
                    for c in chunks
                ]
            }
        elif format == "markdown":
            data = self._export_document_markdown(document, chunks)
        else:
            return {
                "status": "error",
                "error": f"Unsupported format: {format}"
            }
        
        return {
            "status": "success",
            "document_id": str(document_id),
            "format": format,
            "chunks_count": len(chunks),
            "data": data
        }
    
    async def export_search_results(
        self,
        project_id: UUID,
        query: str,
        results: List[Dict[str, Any]],
        format: str = "json"
    ) -> Dict[str, Any]:
        """
        Export search results in specified format.
        
        Args:
            project_id: Project UUID
            query: Original query
            results: Search results
            format: Export format
            
        Returns:
            Dict with formatted results
        """
        if format == "json":
            data = {
                "query": query,
                "project_id": str(project_id),
                "results_count": len(results),
                "timestamp": datetime.utcnow().isoformat(),
                "results": results
            }
        elif format == "csv":
            data = self._export_results_csv(query, results)
        elif format == "markdown":
            data = self._export_results_markdown(query, results)
        else:
            return {
                "status": "error",
                "error": f"Unsupported format: {format}"
            }
        
        return {
            "status": "success",
            "format": format,
            "data": data
        }
    
    def _export_json(
        self,
        project: Any,
        documents: List[Any],
        chunks: List[Any],
        include_embeddings: bool,
        include_metadata: bool
    ) -> Dict[str, Any]:
        """Export data as JSON."""
        return {
            "project": {
                "id": str(project.id),
                "name": project.name,
                "created_at": project.created_at.isoformat(),
                "updated_at": project.updated_at.isoformat(),
            },
            "documents": [
                {
                    "id": str(d.id),
                    "source_type": d.source_type,
                    "source_url": d.source_url,
                    "content_hash": d.content_hash,
                    "status": d.status,
                    "fact_count": d.fact_count,
                    "created_at": d.created_at.isoformat(),
                    "processed_at": d.processed_at.isoformat() if d.processed_at else None,
                }
                for d in documents
            ],
            "chunks": [
                {
                    "id": str(c.id),
                    "document_id": str(c.document_id),
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "start_offset": c.start_offset,
                    "end_offset": c.end_offset,
                    "created_at": c.created_at.isoformat(),
                    **({"embedding": c.embedding} if include_embeddings else {}),
                    **({"metadata": c.metadata} if include_metadata and hasattr(c, 'metadata') else {})
                }
                for c in chunks
            ]
        }
    
    def _export_csv(
        self,
        project: Any,
        documents: List[Any],
        chunks: List[Any],
        include_metadata: bool
    ) -> str:
        """Export chunks as CSV."""
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'chunk_id', 'document_id', 'chunk_index', 'text',
            'start_offset', 'end_offset', 'source_url', 'created_at'
        ])
        
        writer.writeheader()
        
        # Create document lookup
        doc_lookup = {str(d.id): d for d in documents}
        
        for chunk in chunks:
            doc = doc_lookup.get(str(chunk.document_id))
            writer.writerow({
                'chunk_id': str(chunk.id),
                'document_id': str(chunk.document_id),
                'chunk_index': chunk.chunk_index,
                'text': chunk.text.replace('\n', ' '),
                'start_offset': chunk.start_offset,
                'end_offset': chunk.end_offset,
                'source_url': doc.source_url if doc else '',
                'created_at': chunk.created_at.isoformat()
            })
        
        return output.getvalue()
    
    def _export_markdown(
        self,
        project: Any,
        documents: List[Any],
        chunks: List[Any],
        include_metadata: bool
    ) -> str:
        """Export as Markdown document."""
        lines = []
        lines.append(f"# {project.name}")
        lines.append(f"\n**Project ID:** `{project.id}`")
        lines.append(f"**Created:** {project.created_at.isoformat()}")
        lines.append(f"**Documents:** {len(documents)}")
        lines.append(f"**Chunks:** {len(chunks)}")
        lines.append("\n---\n")
        
        # Group chunks by document
        doc_chunks = {}
        for chunk in chunks:
            doc_id = str(chunk.document_id)
            if doc_id not in doc_chunks:
                doc_chunks[doc_id] = []
            doc_chunks[doc_id].append(chunk)
        
        # Create document lookup
        doc_lookup = {str(d.id): d for d in documents}
        
        # Export each document
        for doc_id, doc_chunk_list in doc_chunks.items():
            doc = doc_lookup.get(doc_id)
            if not doc:
                continue
            
            lines.append(f"## {doc.source_url}")
            lines.append(f"\n**Source:** {doc.source_type}")
            lines.append(f"**Status:** {doc.status}")
            lines.append(f"**Chunks:** {len(doc_chunk_list)}\n")
            
            # Sort chunks by index
            doc_chunk_list.sort(key=lambda c: c.chunk_index)
            
            for chunk in doc_chunk_list:
                lines.append(f"### Chunk {chunk.chunk_index}")
                lines.append(f"\n{chunk.text}\n")
            
            lines.append("\n---\n")
        
        return "\n".join(lines)
    
    def _export_document_markdown(self, document: Any, chunks: List[Any]) -> str:
        """Export single document as Markdown."""
        lines = []
        lines.append(f"# {document.source_url}")
        lines.append(f"\n**Source Type:** {document.source_type}")
        lines.append(f"**Status:** {document.status}")
        lines.append(f"**Created:** {document.created_at.isoformat()}")
        lines.append(f"**Chunks:** {len(chunks)}\n")
        lines.append("---\n")
        
        # Sort chunks by index
        chunks.sort(key=lambda c: c.chunk_index)
        
        for chunk in chunks:
            lines.append(f"## Chunk {chunk.chunk_index}")
            lines.append(f"\n{chunk.text}\n")
            lines.append("---\n")
        
        return "\n".join(lines)
    
    def _export_results_csv(self, query: str, results: List[Dict]) -> str:
        """Export search results as CSV."""
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'rank', 'similarity', 'chunk_id', 'document_id', 'text', 'source'
        ])
        
        writer.writeheader()
        
        for i, result in enumerate(results):
            writer.writerow({
                'rank': i + 1,
                'similarity': result.get('similarity', 0.0),
                'chunk_id': result.get('chunk_id', ''),
                'document_id': result.get('document_id', ''),
                'text': result.get('text', '').replace('\n', ' ')[:500],
                'source': result.get('source_url', '')
            })
        
        return output.getvalue()
    
    def _export_results_markdown(self, query: str, results: List[Dict]) -> str:
        """Export search results as Markdown."""
        lines = []
        lines.append(f"# Search Results")
        lines.append(f"\n**Query:** {query}")
        lines.append(f"**Results:** {len(results)}")
        lines.append(f"**Timestamp:** {datetime.utcnow().isoformat()}\n")
        lines.append("---\n")
        
        for i, result in enumerate(results):
            lines.append(f"## Result {i + 1}")
            lines.append(f"\n**Similarity:** {result.get('similarity', 0.0):.4f}")
            lines.append(f"**Source:** {result.get('source_url', 'Unknown')}")
            lines.append(f"\n{result.get('text', '')}\n")
            lines.append("---\n")
        
        return "\n".join(lines)
