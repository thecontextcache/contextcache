"""
Provenance model - Tracks the origin and chain of custody for facts
"""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class Provenance(BaseModel):
    """
    Provenance tracks the complete origin and extraction history of a fact.
    
    Every fact has associated provenance that records where it came from,
    how it was extracted, and the full chain of custody. This enables
    traceable answers and reproducible research.
    
    Attributes:
        id: Unique provenance identifier
        fact_id: The fact this provenance describes
        source_type: Type of source (document, url, user_input, imported_pack)
        source_id: Identifier of the source
        source_url: URL if applicable
        document_title: Title of source document if applicable
        chunk_id: ID of text chunk this fact was extracted from
        chunk_text: The actual text chunk
        extractor_name: Name of extraction algorithm/model
        extractor_version: Version of extractor
        extraction_method: Method used (llm, rule_based, hybrid)
        extracted_at: Timestamp of extraction
        confidence: Extraction confidence
        metadata: Additional extraction metadata
    """
    
    id: UUID = Field(default_factory=uuid4, description="Unique provenance ID")
    fact_id: UUID = Field(..., description="Fact this provenance describes")
    
    # Source information
    source_type: str = Field(
        ...,
        description="Source type",
        examples=["document", "url", "user_input", "imported_pack", "email"]
    )
    source_id: str = Field(
        ...,
        description="Source identifier",
        examples=["doc-123", "https://...", "manual-entry-1"]
    )
    source_url: Optional[str] = Field(
        None,
        max_length=2000,
        description="Source URL if applicable"
    )
    document_title: Optional[str] = Field(
        None,
        max_length=500,
        description="Document title if applicable"
    )
    
    # Chunk information
    chunk_id: Optional[str] = Field(
        None,
        description="Text chunk identifier"
    )
    chunk_text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Source text chunk"
    )
    
    # Extraction information
    extractor_name: str = Field(
        ...,
        description="Extractor algorithm/model name",
        examples=["default_extractor", "gpt-4", "custom_rule_engine"]
    )
    extractor_version: str = Field(
        ...,
        description="Extractor version",
        examples=["0.1.0", "gpt-4-1106-preview"]
    )
    extraction_method: str = Field(
        ...,
        description="Extraction method",
        examples=["llm", "rule_based", "hybrid", "manual"]
    )
    extracted_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Extraction timestamp (UTC)"
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Extraction confidence"
    )
    
    # Additional metadata
    metadata: Optional[dict] = Field(
        None,
        description="Additional extraction metadata",
        examples=[{"model": "gpt-4", "temperature": 0.1, "chunk_position": 42}]
    )
    
    @field_validator('source_type')
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        """Validate and normalize source type."""
        stripped = v.strip().lower()
        if not stripped:
            raise ValueError("Source type cannot be empty")
        
        valid_types = {
            "document", "url", "user_input", "imported_pack", 
            "email", "api", "database"
        }
        
        if stripped not in valid_types:
            pass
        
        return stripped
    
    @field_validator('extraction_method')
    @classmethod
    def validate_extraction_method(cls, v: str) -> str:
        """Validate extraction method."""
        stripped = v.strip().lower()
        if not stripped:
            raise ValueError("Extraction method cannot be empty")
        
        valid_methods = {"llm", "rule_based", "hybrid", "manual"}
        
        if stripped not in valid_methods:
            raise ValueError(
                f"Extraction method must be one of: {', '.join(valid_methods)}"
            )
        
        return stripped
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "990e8400-e29b-41d4-a716-446655440000",
                "fact_id": "770e8400-e29b-41d4-a716-446655440000",
                "source_type": "url",
                "source_id": "https://en.wikipedia.org/wiki/Marie_Curie",
                "source_url": "https://en.wikipedia.org/wiki/Marie_Curie",
                "document_title": "Marie Curie - Wikipedia",
                "chunk_id": "chunk-42",
                "chunk_text": "In 1903, Marie Curie became the first woman to win...",
                "extractor_name": "default_extractor",
                "extractor_version": "0.1.0",
                "extraction_method": "llm",
                "extracted_at": "2025-01-15T10:35:00Z",
                "confidence": 0.95,
                "metadata": {
                    "model": "gpt-4",
                    "temperature": 0.1,
                    "chunk_position": 42
                }
            }
        }


class ProvenanceCreate(BaseModel):
    """Schema for creating provenance."""
    
    fact_id: UUID
    source_type: str
    source_id: str
    source_url: Optional[str] = None
    document_title: Optional[str] = None
    chunk_id: Optional[str] = None
    chunk_text: str = Field(..., min_length=1, max_length=5000)
    extractor_name: str
    extractor_version: str
    extraction_method: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    metadata: Optional[dict] = None


class ProvenanceResponse(BaseModel):
    """Public provenance response."""
    
    id: UUID
    fact_id: UUID
    source_type: str
    source_id: str
    source_url: Optional[str]
    document_title: Optional[str]
    chunk_text: str
    extractor_name: str
    extractor_version: str
    extraction_method: str
    extracted_at: datetime
    confidence: float
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "990e8400-e29b-41d4-a716-446655440000",
                "fact_id": "770e8400-e29b-41d4-a716-446655440000",
                "source_type": "url",
                "source_id": "https://en.wikipedia.org/wiki/Marie_Curie",
                "source_url": "https://en.wikipedia.org/wiki/Marie_Curie",
                "document_title": "Marie Curie - Wikipedia",
                "chunk_text": "In 1903, Marie Curie became the first woman...",
                "extractor_name": "default_extractor",
                "extractor_version": "0.1.0",
                "extraction_method": "llm",
                "extracted_at": "2025-01-15T10:35:00Z",
                "confidence": 0.95
            }
        }