"""
AuditEvent model - Cryptographically verifiable event chain
"""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class AuditEvent(BaseModel):
    """
    AuditEvent represents a single event in the cryptographic audit chain.
    
    Every mutation to the knowledge graph is recorded in an immutable,
    hash-linked chain using BLAKE3. This enables verification of data
    integrity and provides a complete history of all changes.
    
    Attributes:
        id: Unique event identifier
        project_id: Project this event belongs to
        event_type: Type of event (fact_added, fact_updated, etc.)
        event_data: Event payload as JSON
        actor: Who/what triggered the event (system, user, analyzer)
        timestamp: Event timestamp (UTC)
        prev_hash: BLAKE3 hash of previous event (32 bytes)
        current_hash: BLAKE3 hash of this event (32 bytes)
    """
    
    id: UUID = Field(default_factory=uuid4, description="Unique event ID")
    project_id: UUID = Field(..., description="Project ID")
    
    event_type: str = Field(
        ...,
        description="Event type",
        examples=[
            "fact_added", "fact_updated", "fact_deleted",
            "rank_computed", "decay_applied",
            "pack_imported", "pack_exported"
        ]
    )
    
    event_data: dict = Field(
        ...,
        description="Event payload (JSON)"
    )
    
    actor: str = Field(
        ...,
        description="Event actor",
        examples=["system", "user", "analyzer", "extractor"]
    )
    
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Event timestamp (UTC)"
    )
    
    prev_hash: bytes = Field(
        ...,
        min_length=32,
        max_length=32,
        description="BLAKE3 hash of previous event (32 bytes)"
    )
    
    current_hash: bytes = Field(
        ...,
        min_length=32,
        max_length=32,
        description="BLAKE3 hash of this event (32 bytes)"
    )
    
    @field_validator('event_type')
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        """Validate and normalize event type."""
        stripped = v.strip().lower()
        if not stripped:
            raise ValueError("Event type cannot be empty")
        
        valid_types = {
            "fact_added", "fact_updated", "fact_deleted",
            "entity_added", "entity_updated", "entity_deleted",
            "relation_added", "relation_deleted",
            "rank_computed", "decay_applied",
            "pack_imported", "pack_exported",
            "project_created", "project_updated"
        }
        
        if stripped not in valid_types:
            # Allow custom event types but validate structure
            pass
        
        return stripped
    
    @field_validator('actor')
    @classmethod
    def validate_actor(cls, v: str) -> str:
        """Validate actor."""
        stripped = v.strip().lower()
        if not stripped:
            raise ValueError("Actor cannot be empty")
        return stripped
    
    @field_validator('prev_hash', 'current_hash')
    @classmethod
    def validate_hash(cls, v: bytes, info) -> bytes:
        """Validate hash is exactly 32 bytes (BLAKE3)."""
        if len(v) != 32:
            field_name = info.field_name
            raise ValueError(f"{field_name} must be exactly 32 bytes, got {len(v)}")
        return v
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "aa0e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "event_type": "fact_added",
                "event_data": {
                    "fact_id": "770e8400-e29b-41d4-a716-446655440000",
                    "action": "add"
                },
                "actor": "user",
                "timestamp": "2025-01-15T10:40:00Z",
                "prev_hash": "9e4b7a1f...",
                "current_hash": "a3f5d8c2..."
            }
        }


class AuditEventCreate(BaseModel):
    """Schema for creating a new audit event."""
    
    project_id: UUID
    event_type: str
    event_data: dict
    actor: str
    prev_hash: bytes = Field(..., min_length=32, max_length=32)
    
    @field_validator('event_type', 'actor')
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be empty")
        return stripped


class AuditEventResponse(BaseModel):
    """Public audit event response."""
    
    id: UUID
    project_id: UUID
    event_type: str
    event_data: dict
    actor: str
    timestamp: datetime
    prev_hash: str = Field(..., description="Hex-encoded hash")
    current_hash: str = Field(..., description="Hex-encoded hash")
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "aa0e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "event_type": "fact_added",
                "event_data": {
                    "fact_id": "770e8400-e29b-41d4-a716-446655440000"
                },
                "actor": "user",
                "timestamp": "2025-01-15T10:40:00Z",
                "prev_hash": "9e4b7a1f8c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f",
                "current_hash": "a3f5d8c2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8"
            }
        }


class AuditChainVerification(BaseModel):
    """Result of audit chain verification."""
    
    valid: bool = Field(..., description="Whether chain is valid")
    events_verified: int = Field(..., description="Number of events verified")
    first_event_hash: str = Field(..., description="Hash of first event")
    last_event_hash: str = Field(..., description="Hash of last event")
    broken_at: Optional[UUID] = Field(None, description="Event ID where chain broke")
    error_message: Optional[str] = Field(None, description="Error details if invalid")
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "valid": True,
                "events_verified": 1523,
                "first_event_hash": "00000000...",
                "last_event_hash": "a3f5d8c2...",
                "broken_at": None,
                "error_message": None
            }
        }