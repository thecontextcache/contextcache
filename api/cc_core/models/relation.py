"""
Relation model - Represents typed edges in the knowledge graph
"""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class Relation(BaseModel):
    """
    Relation represents a typed edge between two entities.
    
    Relations connect entities in the knowledge graph and are derived
    from facts. Each relation has a predicate (relationship type) and
    a confidence score.
    
    Attributes:
        id: Unique relation identifier
        project_id: Project this relation belongs to
        subject_id: Source entity UUID
        predicate: Relationship type
        object_id: Target entity UUID (or literal value)
        confidence: Relation confidence (0.0 to 1.0)
        created_at: Relation creation timestamp
    """
    
    id: UUID = Field(default_factory=uuid4, description="Unique relation ID")
    project_id: UUID = Field(..., description="Project ID")
    
    subject_id: UUID = Field(
        ...,
        description="Source entity ID",
        examples=["660e8400-e29b-41d4-a716-446655440000"]
    )
    
    predicate: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Relationship type",
        examples=["won", "works_at", "invented", "located_in", "is_a"]
    )
    
    object_id: UUID = Field(
        ...,
        description="Target entity ID",
        examples=["770e8400-e29b-41d4-a716-446655440000"]
    )
    
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Relation confidence score"
    )
    
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Creation timestamp (UTC)"
    )
    
    @field_validator('predicate')
    @classmethod
    def validate_predicate(cls, v: str) -> str:
        """Validate predicate and normalize."""
        stripped = v.strip().lower().replace(" ", "_")
        if not stripped:
            raise ValueError("Predicate cannot be empty or whitespace")
        return stripped
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "880e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "subject_id": "660e8400-e29b-41d4-a716-446655440000",
                "predicate": "won",
                "object_id": "770e8400-e29b-41d4-a716-446655440000",
                "confidence": 0.95,
                "created_at": "2025-01-15T10:40:00Z"
            }
        }


class RelationCreate(BaseModel):
    """Schema for creating a new relation."""
    
    project_id: UUID
    subject_id: UUID
    predicate: str = Field(..., min_length=1, max_length=200)
    object_id: UUID
    confidence: float = Field(..., ge=0.0, le=1.0)
    
    @field_validator('predicate')
    @classmethod
    def validate_predicate(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Predicate cannot be empty")
        return stripped


class RelationUpdate(BaseModel):
    """Schema for updating a relation."""
    
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)


class RelationResponse(BaseModel):
    """Public relation response with entity details."""
    
    id: UUID
    project_id: UUID
    subject_id: UUID
    predicate: str
    object_id: UUID
    confidence: float
    created_at: datetime
    
    # Optional expanded fields (populated on request)
    subject_name: Optional[str] = Field(None, description="Subject entity name")
    object_name: Optional[str] = Field(None, description="Object entity name")
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "880e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "subject_id": "660e8400-e29b-41d4-a716-446655440000",
                "predicate": "won",
                "object_id": "770e8400-e29b-41d4-a716-446655440000",
                "confidence": 0.95,
                "created_at": "2025-01-15T10:40:00Z",
                "subject_name": "Marie Curie",
                "object_name": "Nobel Prize in Physics"
            }
        }