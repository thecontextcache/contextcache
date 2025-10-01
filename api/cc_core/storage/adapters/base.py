"""
Base storage adapter interface
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from cc_core.models import (
    Project,
    Fact,
    Entity,
    Relation,
    Provenance,
    AuditEvent,
)


class StorageAdapter(ABC):
    """
    Abstract base class for storage adapters.
    
    Implementations: PostgresAdapter, SQLiteAdapter
    """
    
    @abstractmethod
    async def connect(self) -> None:
        """Establish database connection."""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Close database connection."""
        pass
    
    # Project operations
    @abstractmethod
    async def create_project(self, project: Project) -> Project:
        """Create a new project."""
        pass
    
    @abstractmethod
    async def get_project(self, project_id: UUID) -> Optional[Project]:
        """Get project by ID."""
        pass
    
    @abstractmethod
    async def list_projects(self, limit: int = 20, offset: int = 0) -> List[Project]:
        """List all projects."""
        pass
    
    @abstractmethod
    async def delete_project(self, project_id: UUID) -> bool:
        """Delete project and all associated data."""
        pass
    
    # Fact operations
    @abstractmethod
    async def create_fact(self, fact: Fact) -> Fact:
        """Create a new fact."""
        pass
    
    @abstractmethod
    async def get_fact(self, fact_id: UUID) -> Optional[Fact]:
        """Get fact by ID."""
        pass
    
    @abstractmethod
    async def list_facts(
        self,
        project_id: UUID,
        limit: int = 20,
        offset: int = 0,
        min_confidence: float = 0.0
    ) -> List[Fact]:
        """List facts for a project."""
        pass
    
    @abstractmethod
    async def update_fact_scores(
        self,
        fact_id: UUID,
        rank_score: Optional[float] = None,
        decay_factor: Optional[float] = None
    ) -> bool:
        """Update fact ranking scores."""
        pass
    
    @abstractmethod
    async def delete_fact(self, fact_id: UUID) -> bool:
        """Delete a fact."""
        pass
    
    # Entity operations
    @abstractmethod
    async def create_entity(self, entity: Entity) -> Entity:
        """Create a new entity."""
        pass
    
    @abstractmethod
    async def get_entity(self, entity_id: UUID) -> Optional[Entity]:
        """Get entity by ID."""
        pass
    
    @abstractmethod
    async def list_entities(
        self,
        project_id: UUID,
        limit: int = 100,
        offset: int = 0
    ) -> List[Entity]:
        """List entities for a project."""
        pass
    
    # Relation operations
    @abstractmethod
    async def create_relation(self, relation: Relation) -> Relation:
        """Create a new relation."""
        pass
    
    @abstractmethod
    async def get_relations_for_entity(
        self,
        entity_id: UUID,
        limit: int = 50
    ) -> List[Relation]:
        """Get all relations involving an entity."""
        pass
    
    # Provenance operations
    @abstractmethod
    async def create_provenance(self, provenance: Provenance) -> Provenance:
        """Create provenance record."""
        pass
    
    @abstractmethod
    async def get_provenance_for_fact(self, fact_id: UUID) -> Optional[Provenance]:
        """Get provenance for a fact."""
        pass
    
    # Audit operations
    @abstractmethod
    async def append_audit_event(self, event: AuditEvent) -> AuditEvent:
        """Append event to audit chain."""
        pass
    
    @abstractmethod
    async def get_audit_events(
        self,
        project_id: UUID,
        limit: int = 100,
        offset: int = 0
    ) -> List[AuditEvent]:
        """Get audit events for a project."""
        pass
    
    @abstractmethod
    async def verify_audit_chain(self, project_id: UUID) -> bool:
        """Verify integrity of audit chain."""
        pass

    