"""
Project model - Represents a user's project with encryption metadata
"""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class Project(BaseModel):
    """
    Project represents a user's isolated knowledge graph.
    
    Each project has its own encryption key derived from a user-supplied
    passphrase via Argon2id. The salt is stored here, but the passphrase
    and derived key are never persisted.
    
    Attributes:
        id: Unique project identifier
        name: Human-readable project name
        salt: Random salt for Argon2id key derivation (128 bits)
        created_at: Project creation timestamp
        updated_at: Last modification timestamp
        metadata: Optional additional project metadata
    """
    
    id: UUID = Field(default_factory=uuid4, description="Unique project ID")
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Project name",
        examples=["My Research Project", "Nobel Prize Analysis"]
    )
    salt: bytes = Field(
        ...,
        min_length=16,
        max_length=16,
        description="128-bit salt for Argon2id KDF"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Project creation timestamp (UTC)"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last update timestamp (UTC)"
    )
    metadata: Optional[dict] = Field(
        default=None,
        description="Optional project metadata (tags, description, etc.)"
    )
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate project name is not empty after stripping whitespace."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Project name cannot be empty or whitespace")
        return stripped
    
    @field_validator('salt')
    @classmethod
    def validate_salt(cls, v: bytes) -> bytes:
        """Validate salt is exactly 16 bytes (128 bits)."""
        if len(v) != 16:
            raise ValueError(f"Salt must be exactly 16 bytes, got {len(v)}")
        return v
    
    def update_timestamp(self) -> None:
        """Update the updated_at timestamp to current UTC time."""
        self.updated_at = datetime.utcnow()
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "AI Research Project",
                "salt": "base64-encoded-16-bytes",
                "created_at": "2025-01-15T10:30:00Z",
                "updated_at": "2025-01-20T14:22:00Z",
                "metadata": {
                    "description": "Analyzing AI research papers",
                    "tags": ["ai", "research", "machine-learning"]
                }
            }
        }


class ProjectCreate(BaseModel):
    """
    Schema for creating a new project.
    
    Requires name and passphrase. Salt will be generated server-side.
    """
    
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Project name"
    )
    passphrase: str = Field(
        ...,
        min_length=20,
        description="Strong passphrase for encryption (min 20 characters)"
    )
    metadata: Optional[dict] = Field(
        default=None,
        description="Optional project metadata"
    )
    
    @field_validator('passphrase')
    @classmethod
    def validate_passphrase(cls, v: str) -> str:
        """Validate passphrase meets minimum security requirements."""
        if len(v) < 20:
            raise ValueError(
                "Passphrase must be at least 20 characters. "
                "Consider using 6+ random words or a strong password."
            )
        
        # Check for common weak patterns
        weak_patterns = [
            "password", "12345", "qwerty", "admin", "letmein",
            "welcome", "monkey", "dragon", "master", "sunshine"
        ]
        lower_pass = v.lower()
        if any(pattern in lower_pass for pattern in weak_patterns):
            raise ValueError(
                "Passphrase contains common weak patterns. "
                "Please use a stronger, more unique passphrase."
            )
        
        return v


class ProjectUpdate(BaseModel):
    """
    Schema for updating an existing project.
    
    All fields are optional - only provided fields will be updated.
    """
    
    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="New project name"
    )
    metadata: Optional[dict] = Field(
        None,
        description="Updated project metadata"
    )
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Validate project name if provided."""
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Project name cannot be empty or whitespace")
            return stripped
        return v


class ProjectResponse(BaseModel):
    """
    Public project response (excludes salt for security).
    
    Used for API responses where salt should not be exposed.
    """
    
    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    metadata: Optional[dict] = None
    
    # Statistics (computed at runtime)
    fact_count: int = Field(0, description="Total facts in project")
    entity_count: int = Field(0, description="Total entities in project")
    relation_count: int = Field(0, description="Total relations in project")
    last_rank_computed: Optional[datetime] = Field(
        None,
        description="Timestamp of last ranking computation"
    )
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "AI Research Project",
                "created_at": "2025-01-15T10:30:00Z",
                "updated_at": "2025-01-20T14:22:00Z",
                "metadata": {
                    "description": "Analyzing AI research papers",
                    "tags": ["ai", "research"]
                },
                "fact_count": 1523,
                "entity_count": 342,
                "relation_count": 1891,
                "last_rank_computed": "2025-01-20T12:00:00Z"
            }
        }