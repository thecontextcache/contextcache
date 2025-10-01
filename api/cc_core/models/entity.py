"""
Entity model - Represents nodes in the knowledge graph
"""
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class Entity(BaseModel):
    """
    Entity represents a node in the knowledge graph.
    
    Entities are extracted from facts and connected by relations.
    Each entity has a type (person, organization, concept, etc.) and
    optional aliases for entity resolution.
    
    Attributes:
        id: Unique entity identifier
        project_id: Project this entity belongs to
        name: Canonical entity name
        entity_type: Classification (person, organization, concept, location, etc.)
        aliases: Alternative names for this entity
        created_at: Entity creation timestamp
        updated_at: Last modification timestamp
    """
    
    id: UUID = Field(default_factory=uuid4, description="Unique entity ID")
    project_id: UUID = Field(..., description="Project ID this entity belongs to")
    
    name: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Canonical entity name",
        examples=["Marie Curie", "Python", "Nobel Prize in Physics"]
    )
    
    entity_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Entity classification",
        examples=["person", "organization", "concept", "location", "event", "technology"]
    )
    
    aliases: list[str] = Field(
        default_factory=list,
        description="Alternative names for entity resolution",
        examples=[["Maria Skłodowska", "Madame Curie"]]
    )
    
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Creation timestamp (UTC)"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last update timestamp (UTC)"
    )
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate entity name is not empty after stripping."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Entity name cannot be empty or whitespace")
        return stripped
    
    @field_validator('entity_type')
    @classmethod
    def validate_entity_type(cls, v: str) -> str:
        """Validate entity type and normalize to lowercase."""
        stripped = v.strip().lower()
        if not stripped:
            raise ValueError("Entity type cannot be empty or whitespace")
        
        # Known entity types (not exhaustive, just for validation hints)
        known_types = {
            "person", "organization", "concept", "location", 
            "event", "technology", "product", "date", "quantity"
        }
        
        # Accept any type, but log if it's uncommon (implementation detail)
        return stripped
    
    @field_validator('aliases')
    @classmethod
    def validate_aliases(cls, v: list[str]) -> list[str]:
        """Validate and deduplicate aliases."""
        # Remove empty strings and strip whitespace
        cleaned = [alias.strip() for alias in v if alias.strip()]
        
        # Remove duplicates while preserving order
        seen = set()
        unique_aliases = []
        for alias in cleaned:
            alias_lower = alias.lower()
            if alias_lower not in seen:
                seen.add(alias_lower)
                unique_aliases.append(alias)
        
        return unique_aliases
    
    def add_alias(self, alias: str) -> None:
        """Add a new alias if not already present."""
        alias_stripped = alias.strip()
        if alias_stripped and alias_stripped.lower() not in [a.lower() for a in self.aliases]:
            self.aliases.append(alias_stripped)
            self.update_timestamp()
    
    def update_timestamp(self) -> None:
        """Update the updated_at timestamp to current UTC time."""
        self.updated_at = datetime.utcnow()
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "660e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "Marie Curie",
                "entity_type": "person",
                "aliases": ["Maria Skłodowska", "Madame Curie"],
                "created_at": "2025-01-15T10:40:00Z",
                "updated_at": "2025-01-20T14:22:00Z"
            }
        }


class EntityCreate(BaseModel):
    """
    Schema for creating a new entity.
    """
    
    project_id: UUID
    name: str = Field(..., min_length=1, max_length=500)
    entity_type: str = Field(..., min_length=1, max_length=100)
    aliases: list[str] = Field(default_factory=list)
    
    @field_validator('name', 'entity_type')
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        """Validate fields are not empty."""
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be empty or whitespace")
        return stripped


class EntityUpdate(BaseModel):
    """
    Schema for updating an existing entity.
    
    All fields optional - only provided fields updated.
    """
    
    name: Optional[str] = Field(None, min_length=1, max_length=500)
    entity_type: Optional[str] = Field(None, min_length=1, max_length=100)
    aliases: Optional[list[str]] = None
    
    @field_validator('name', 'entity_type')
    @classmethod
    def validate_not_empty(cls, v: Optional[str]) -> Optional[str]:
        """Validate fields if provided."""
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Field cannot be empty or whitespace")
            return stripped
        return v


class EntityResponse(BaseModel):
    """
    Public entity response with statistics.
    """
    
    id: UUID
    project_id: UUID
    name: str
    entity_type: str
    aliases: list[str]
    created_at: datetime
    updated_at: datetime
    
    # Statistics (computed at runtime)
    fact_count: int = Field(0, description="Facts mentioning this entity")
    relation_count: int = Field(0, description="Relations involving this entity")
    
    class Config:
        """Pydantic configuration."""
        json_schema_extra = {
            "example": {
                "id": "660e8400-e29b-41d4-a716-446655440000",
                "project_id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "Marie Curie",
                "entity_type": "person",
                "aliases": ["Maria Skłodowska", "Madame Curie"],
                "created_at": "2025-01-15T10:40:00Z",
                "updated_at": "2025-01-20T14:22:00Z",
                "fact_count": 23,
                "relation_count": 15
            }
        }