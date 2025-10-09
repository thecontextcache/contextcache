"""
Ingest service - orchestrates document processing pipeline
"""
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime

from cc_core.services.document_service import DocumentService
from cc_core.services.embedding_service import EmbeddingService
from cc_core.storage import StorageAdapter
from cc_core.models.document import DocumentDB, DocumentStatus


class IngestService:
    """
    Service for orchestrating document ingestion pipeline.
    Handles validation, deduplication, processing, and storage.
    """
    
    def __init__(self, storage: StorageAdapter):
        """
        Initialize ingest service.
        
        Args:
            storage: Storage adapter instance
        """
        self.storage = storage
        self.doc_service = DocumentService()
        self.embed_service = EmbeddingService()
    
    async def ingest_url(
        self,
        project_id: UUID,
        url: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Ingest document from URL.
        
        Args:
            project_id: Project UUID
            url: URL to fetch
            metadata: Optional metadata to attach
            
        Returns:
            Dict with ingestion results
        """
        # Validate URL
        validation = self._validate_url(url)
        if not validation["valid"]:
            return {
                "status": "failed",
                "error": validation["error"],
                "stage": "validation"
            }
        
        # Fetch content
        try:
            text, title = await self.doc_service.fetch_url_content(url)
        except Exception as e:
            return {
                "status": "failed",
                "error": f"Failed to fetch URL: {str(e)}",
                "stage": "fetch"
            }
        
        # Validate content quality
        quality = self._validate_content_quality(text)
        if not quality["valid"]:
            return {
                "status": "failed",
                "error": quality["error"],
                "stage": "quality_check"
            }
        
        # Check for duplicates
        content_hash = self.doc_service.compute_content_hash(text)
        duplicate = await self._check_duplicate(project_id, content_hash)
        if duplicate:
            return {
                "status": "duplicate",
                "document_id": str(duplicate),
                "message": "Document already exists",
                "stage": "deduplication"
            }
        
        # Create document record
        document = DocumentDB(
            project_id=project_id,
            source_type="url",
            source_url=url,
            content_hash=content_hash,
            status=DocumentStatus.processing.value,
        )
        
        doc_id = await self.storage.create_document(document)
        
        # Process document
        try:
            result = await self._process_document(
                doc_id=doc_id,
                text=text,
                title=title,
                metadata=metadata
            )
            
            # Update status
            await self.storage.update_document_status(
                doc_id,
                DocumentStatus.completed.value
            )
            
            return {
                "status": "success",
                "document_id": str(doc_id),
                "chunks_created": result["chunks"],
                "title": title,
                "stage": "completed"
            }
            
        except Exception as e:
            # Update status to failed
            await self.storage.update_document_status(
                doc_id,
                DocumentStatus.failed.value
            )
            
            return {
                "status": "failed",
                "error": str(e),
                "document_id": str(doc_id),
                "stage": "processing"
            }
    
    async def ingest_file(
        self,
        project_id: UUID,
        filename: str,
        content: bytes,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Ingest document from file upload.
        
        Args:
            project_id: Project UUID
            filename: Original filename
            content: File content bytes
            metadata: Optional metadata to attach
            
        Returns:
            Dict with ingestion results
        """
        # Validate file
        validation = self._validate_file(filename, content)
        if not validation["valid"]:
            return {
                "status": "failed",
                "error": validation["error"],
                "stage": "validation"
            }
        
        # Extract text
        try:
            if filename.endswith('.pdf'):
                text = await self.doc_service.extract_text_from_pdf(content)
            elif filename.endswith('.txt'):
                text = content.decode('utf-8')
            else:
                return {
                    "status": "failed",
                    "error": "Unsupported file type",
                    "stage": "extraction"
                }
        except Exception as e:
            return {
                "status": "failed",
                "error": f"Failed to extract text: {str(e)}",
                "stage": "extraction"
            }
        
        # Validate content quality
        quality = self._validate_content_quality(text)
        if not quality["valid"]:
            return {
                "status": "failed",
                "error": quality["error"],
                "stage": "quality_check"
            }
        
        # Check for duplicates
        content_hash = self.doc_service.compute_content_hash(text)
        duplicate = await self._check_duplicate(project_id, content_hash)
        if duplicate:
            return {
                "status": "duplicate",
                "document_id": str(duplicate),
                "message": "Document already exists",
                "stage": "deduplication"
            }
        
        # Create document record
        document = DocumentDB(
            project_id=project_id,
            source_type="file",
            source_url=filename,
            content_hash=content_hash,
            status=DocumentStatus.processing.value,
        )
        
        doc_id = await self.storage.create_document(document)
        
        # Process document
        try:
            result = await self._process_document(
                doc_id=doc_id,
                text=text,
                title=filename,
                metadata=metadata
            )
            
            # Update status
            await self.storage.update_document_status(
                doc_id,
                DocumentStatus.completed.value
            )
            
            return {
                "status": "success",
                "document_id": str(doc_id),
                "chunks_created": result["chunks"],
                "title": filename,
                "stage": "completed"
            }
            
        except Exception as e:
            # Update status to failed
            await self.storage.update_document_status(
                doc_id,
                DocumentStatus.failed.value
            )
            
            return {
                "status": "failed",
                "error": str(e),
                "document_id": str(doc_id),
                "stage": "processing"
            }
    
    async def _process_document(
        self,
        doc_id: UUID,
        text: str,
        title: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process document: chunk, embed, and store.
        
        Args:
            doc_id: Document ID
            text: Document text
            title: Document title
            metadata: Optional metadata
            
        Returns:
            Dict with processing results
        """
        # Chunk text
        chunks = self.doc_service.chunk_text(text, chunk_size=1000, overlap=200)
        
        # Extract embeddings
        chunk_texts = [c["text"] for c in chunks]
        embeddings = self.embed_service.embed_batch(chunk_texts)
        
        # Store chunks
        for chunk, embedding in zip(chunks, embeddings):
            await self.storage.create_chunk(
                document_id=doc_id,
                chunk_index=chunk["metadata"]["chunk_index"],
                text=chunk["text"],
                embedding=embedding,
                start_offset=chunk["start_offset"],
                end_offset=chunk["end_offset"],
                metadata={
                    **chunk["metadata"],
                    "title": title,
                    **(metadata or {})
                }
            )
        
        # Update document fact count
        await self.storage.update_document(
            doc_id,
            {"fact_count": len(chunks), "processed_at": datetime.utcnow()}
        )
        
        return {
            "chunks": len(chunks),
            "embeddings": len(embeddings)
        }
    
    async def _check_duplicate(
        self,
        project_id: UUID,
        content_hash: str
    ) -> Optional[UUID]:
        """
        Check if document with same content already exists.
        
        Args:
            project_id: Project UUID
            content_hash: Content hash to check
            
        Returns:
            Document ID if duplicate found, None otherwise
        """
        existing = await self.storage.find_document_by_hash(
            project_id,
            content_hash
        )
        return existing.id if existing else None
    
    def _validate_url(self, url: str) -> Dict[str, Any]:
        """Validate URL format and safety."""
        if not url:
            return {"valid": False, "error": "URL cannot be empty"}
        
        if not url.startswith(('http://', 'https://')):
            return {"valid": False, "error": "URL must start with http:// or https://"}
        
        if len(url) > 2000:
            return {"valid": False, "error": "URL too long (max 2000 characters)"}
        
        # Block localhost and private IPs (SSRF protection)
        blocked_hosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1']
        if any(host in url.lower() for host in blocked_hosts):
            return {"valid": False, "error": "Cannot fetch from localhost"}
        
        return {"valid": True}
    
    def _validate_file(self, filename: str, content: bytes) -> Dict[str, Any]:
        """Validate file upload."""
        if not filename:
            return {"valid": False, "error": "Filename cannot be empty"}
        
        if not content:
            return {"valid": False, "error": "File content cannot be empty"}
        
        # Check file size (50MB max)
        max_size = 50 * 1024 * 1024
        if len(content) > max_size:
            return {"valid": False, "error": "File too large (max 50MB)"}
        
        # Check file extension
        allowed_extensions = ['.pdf', '.txt']
        if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
            return {"valid": False, "error": f"File type not supported. Allowed: {', '.join(allowed_extensions)}"}
        
        return {"valid": True}
    
    def _validate_content_quality(self, text: str) -> Dict[str, Any]:
        """Validate extracted content quality."""
        if not text or len(text.strip()) < 10:
            return {"valid": False, "error": "Extracted text too short (min 10 characters)"}
        
        # Check if text is mostly readable (not binary garbage)
        readable_chars = sum(c.isprintable() or c.isspace() for c in text[:1000])
        if readable_chars / min(len(text), 1000) < 0.7:
            return {"valid": False, "error": "Text contains too many non-readable characters"}
        
        return {"valid": True}
