"""
Fact model - Represents a knowledge quad with provenance
"""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class Fact(BaseModel):
    """
    Fact represents a knowledge quad: (subject, predicate, object, context).
    
    Each fact is encrypted at rest and includes confidence scoring,
    semantic embeddings, and full provenance tracking.
    
    Attributes:
        id: Unique fact identifier
        project_id: Project this fact belongs to
        subject: The entity being described
        predicate: The relationship type
        object: The value or target entity
        context: The source or scope of this assertion
        confidence: Extraction confidence (0.0 to 1.0)
        embedding: Semantic embedding vector (768 dimensions)
        rank_score: Computed relevance score (updated by analyzer)
        decay_factor: Time-based decay multiplier
        created_at: Fact creation timestamp
        last_accessed: Last time this fact was retrieved
    """
    
    id: UUID = Field(default_factory=uuid4, description="Unique fact ID")
    project_id: UUID = Field(..., description="Project ID this fact belongs to")
    
    # The quad
    subject: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Subject of the fact",
        examples=["Marie Curie", "Artificial Intelligence", "Python"]
    )
    predicate: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Relationship or property",
        examples=["won", "is a", "invented", "discovered"]
    )
    object: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Object or value",
        examples=["Nobel Prize in Physics", "programming language", "1903"]
    )
    context: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Context or source",
        examples=["Wikipedia: Marie Curie", "Research paper (2023)", "Book: AI Fundamentals"]
    )
    
    # Metadata
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Extraction confidence score"
    )
    embedding: Optional[list[float]] = Field(
        None,
        description="768-dimensional semantic embedding"
    )
    rank_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Computed relevance score"
    )
    decay_factor: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Time-based decay multiplier"
    )
    
    # Timestamps
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Creation timestamp (UTC)"
    )
    last_accessed: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last access timestamp (UTC)"
    )
    
    @field_validator('subject', 'predicate', 'object', 'context')
    @classmethod
    def validate_not_empty(cls, v: str, info) -> str:
        """Validate quad fields are not empty after stripping whitespace."""
        stripped = v.strip()
        if not stripped:
            field_name = info.field_name
            raise ValueError(f"{field_name} cannot be empty or whitespace")
        return stripped
    
    @field_validator('embedding')
    @classmethod
    def validate_embedding_dimension(cls, v: Optional[list[float]]) -> Optional[list[float]]:
        """Validate embedding is exactly 768 dimensions if provided."""
        if v is not None and len(v) != 768:
            raise ValueError(f"Embedding must be exactly 768 dimensions, got {len(v)}")
        return v
    
    def update_access_time(self) -> None:
        """Update last_accessed to current UTC time."""
        self.last_accessed = datetime.utcnow()
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "770e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "subject": "Marie Curie",
                "predicate": "won",
                "object": "Nobel Prize in Physics",
                "context": "Wikipedia article (2025-01-15)",
                "confidence": 0.98,
                "embedding": None,
                "rank_score": 0.87,
                "decay_factor": 0.92,
                "created_at": "2025-01-15T10:40:00Z",
                "last_accessed": "2025-01-20T14:22:00Z"
            }
        }


class FactCreate(BaseModel):
    """
    Schema for creating a new fact.
    
    Embedding and scores are computed server-side.
    """
    
    project_id: UUID
    subject: str = Field(..., min_length=1, max_length=500)
    predicate: str = Field(..., min_length=1, max_length=200)
    object: str = Field(..., min_length=1, max_length=500)
    context: str = Field(..., min_length=1, max_length=1000)
    confidence: float = Field(..., ge=0.0, le=1.0)
    
    @field_validator('subject', 'predicate', 'object', 'context')
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        """Validate fields are not empty."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be empty or whitespace")
        return stripped


class FactUpdate(BaseModel):
    """
    Schema for updating an existing fact.
    
    Only confidence and rank_score can be updated directly.
    Other fields require creating a new fact.
    """
    
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    rank_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    decay_factor: Optional[float] = Field(None, ge=0.0, le=1.0)


class FactResponse(BaseModel):
    """
    Public fact response with computed fields.
    
    Includes provenance and explanation data.
    """
    
    id: UUID
    project_id: UUID
    subject: str
    predicate: str
    object: str
    context: str
    confidence: float
    rank_score: float
    decay_factor: float
    created_at: datetime
    last_accessed: datetime
    
    # Optional expanded fields
    similarity: Optional[float] = Field(
        None,
        description="Semantic similarity to query (if applicable)"
    )
    explanation: Optional[dict] = Field(
        None,
        description="Ranking explanation (if requested)"
    )
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "770e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "subject": "Marie Curie",
                "predicate": "discovered",
                "object": "Radium",
                "context": "Research paper: Curie, M. (1898)",
                "confidence": 0.98,
                "rank_score": 0.87,
                "decay_factor": 0.92,
                "created_at": "2025-01-15T10:40:00Z",
                "last_accessed": "2025-01-20T14:22:00Z",
                "similarity": 0.93,
                "explanation": {
                    "pagerank_score": 0.92,
                    "decay_reason": "Created 5 days ago",
                    "final_computation": "0.92 * 0.95 * 0.98 = 0.87"
                }
            }
        }