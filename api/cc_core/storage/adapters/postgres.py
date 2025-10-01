"""
PostgreSQL storage adapter with pgvector support
"""
from typing import List, Optional
from uuid import UUID

import asyncpg
from asyncpg.pool import Pool

from cc_core.crypto import encrypt_content, decrypt_content
from cc_core.models import (
    Project,
    Fact,
    Entity,
    Relation,
    Provenance,
    AuditEvent,
)
from cc_core.storage.adapters.base import StorageAdapter


class PostgresAdapter(StorageAdapter):
    """PostgreSQL storage adapter with encryption."""
    
    def __init__(self, database_url: str, encryption_key: bytes):
        """
        Initialize PostgreSQL adapter.
        
        Args:
            database_url: PostgreSQL connection string
            encryption_key: Master encryption key (32 bytes)
        """
        self.database_url = database_url
        self.encryption_key = encryption_key
        self.pool: Optional[Pool] = None
    
    async def connect(self) -> None:
        """Establish connection pool."""
        self.pool = await asyncpg.create_pool(
            self.database_url,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
    
    async def disconnect(self) -> None:
        """Close connection pool."""
        if self.pool:
            await self.pool.close()
    
    # Project operations
    async def create_project(self, project: Project) -> Project:
        """Create a new project."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO projects (id, name, salt, created_at, updated_at, metadata)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                project.id,
                project.name,
                project.salt,
                project.created_at,
                project.updated_at,
                project.metadata
            )
        return project
    
    async def get_project(self, project_id: UUID) -> Optional[Project]:
        """Get project by ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM projects WHERE id = $1",
                project_id
            )
            if row:
                return Project(
                    id=row['id'],
                    name=row['name'],
                    salt=bytes(row['salt']),
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    metadata=row['metadata']
                )
        return None
    
    async def list_projects(self, limit: int = 20, offset: int = 0) -> List[Project]:
        """List all projects."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM projects
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
                """,
                limit,
                offset
            )
            return [
                Project(
                    id=row['id'],
                    name=row['name'],
                    salt=bytes(row['salt']),
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    metadata=row['metadata']
                )
                for row in rows
            ]
    
    async def delete_project(self, project_id: UUID) -> bool:
        """Delete project (CASCADE deletes all related data)."""
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM projects WHERE id = $1",
                project_id
            )
            return result == "DELETE 1"
    
    # Fact operations
    async def create_fact(self, fact: Fact) -> Fact:
        """Create a new fact (with encryption)."""
        # Encrypt fact content
        content = f"{fact.subject}|{fact.predicate}|{fact.object}|{fact.context}".encode()
        ciphertext, nonce = encrypt_content(content, self.encryption_key)
        
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO facts (
                    id, project_id, encrypted_content, nonce, tag,
                    confidence, embedding, rank_score, decay_factor,
                    created_at, last_accessed
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                fact.id,
                fact.project_id,
                ciphertext,
                nonce,
                b'',  # Tag included in ciphertext for XChaCha20-Poly1305
                fact.confidence,
                fact.embedding,
                fact.rank_score,
                fact.decay_factor,
                fact.created_at,
                fact.last_accessed
            )
        return fact
    
    async def get_fact(self, fact_id: UUID) -> Optional[Fact]:
        """Get fact by ID (with decryption)."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM facts WHERE id = $1",
                fact_id
            )
            if row:
                # Decrypt content
                plaintext = decrypt_content(
                    bytes(row['encrypted_content']),
                    bytes(row['nonce']),
                    self.encryption_key
                )
                parts = plaintext.decode().split('|', 3)
                
                return Fact(
                    id=row['id'],
                    project_id=row['project_id'],
                    subject=parts[0],
                    predicate=parts[1],
                    object=parts[2],
                    context=parts[3],
                    confidence=row['confidence'],
                    embedding=list(row['embedding']) if row['embedding'] else None,
                    rank_score=row['rank_score'],
                    decay_factor=row['decay_factor'],
                    created_at=row['created_at'],
                    last_accessed=row['last_accessed']
                )
        return None
    
    async def list_facts(
        self,
        project_id: UUID,
        limit: int = 20,
        offset: int = 0,
        min_confidence: float = 0.0
    ) -> List[Fact]:
        """List facts for a project."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM facts
                WHERE project_id = $1 AND confidence >= $2
                ORDER BY rank_score DESC, created_at DESC
                LIMIT $3 OFFSET $4
                """,
                project_id,
                min_confidence,
                limit,
                offset
            )
            
            facts = []
            for row in rows:
                plaintext = decrypt_content(
                    bytes(row['encrypted_content']),
                    bytes(row['nonce']),
                    self.encryption_key
                )
                parts = plaintext.decode().split('|', 3)
                
                facts.append(Fact(
                    id=row['id'],
                    project_id=row['project_id'],
                    subject=parts[0],
                    predicate=parts[1],
                    object=parts[2],
                    context=parts[3],
                    confidence=row['confidence'],
                    embedding=list(row['embedding']) if row['embedding'] else None,
                    rank_score=row['rank_score'],
                    decay_factor=row['decay_factor'],
                    created_at=row['created_at'],
                    last_accessed=row['last_accessed']
                ))
            return facts
    
    async def update_fact_scores(
        self,
        fact_id: UUID,
        rank_score: Optional[float] = None,
        decay_factor: Optional[float] = None
    ) -> bool:
        """Update fact ranking scores."""
        updates = []
        params = []
        param_idx = 1
        
        if rank_score is not None:
            updates.append(f"rank_score = ${param_idx}")
            params.append(rank_score)
            param_idx += 1
        
        if decay_factor is not None:
            updates.append(f"decay_factor = ${param_idx}")
            params.append(decay_factor)
            param_idx += 1
        
        if not updates:
            return False
        
        params.append(fact_id)
        query = f"UPDATE facts SET {', '.join(updates)} WHERE id = ${param_idx}"
        
        async with self.pool.acquire() as conn:
            result = await conn.execute(query, *params)
            return result == "UPDATE 1"
    
    async def delete_fact(self, fact_id: UUID) -> bool:
        """Delete a fact."""
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM facts WHERE id = $1",
                fact_id
            )
            return result == "DELETE 1"
    
    # Entity operations
    async def create_entity(self, entity: Entity) -> Entity:
        """Create entity (with encryption)."""
        ciphertext, nonce = encrypt_content(entity.name.encode(), self.encryption_key)
        
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO entities (
                    id, project_id, encrypted_name, nonce, tag,
                    entity_type, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                entity.id,
                entity.project_id,
                ciphertext,
                nonce,
                b'',
                entity.entity_type,
                entity.created_at,
                entity.updated_at
            )
        return entity
    
    async def get_entity(self, entity_id: UUID) -> Optional[Entity]:
        """Get entity by ID (with decryption)."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM entities WHERE id = $1",
                entity_id
            )
            if row:
                name = decrypt_content(
                    bytes(row['encrypted_name']),
                    bytes(row['nonce']),
                    self.encryption_key
                ).decode()
                
                return Entity(
                    id=row['id'],
                    project_id=row['project_id'],
                    name=name,
                    entity_type=row['entity_type'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )
        return None
    
    async def list_entities(
        self,
        project_id: UUID,
        limit: int = 100,
        offset: int = 0
    ) -> List[Entity]:
        """List entities for a project."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM entities
                WHERE project_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                project_id,
                limit,
                offset
            )
            
            entities = []
            for row in rows:
                name = decrypt_content(
                    bytes(row['encrypted_name']),
                    bytes(row['nonce']),
                    self.encryption_key
                ).decode()
                
                entities.append(Entity(
                    id=row['id'],
                    project_id=row['project_id'],
                    name=name,
                    entity_type=row['entity_type'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                ))
            return entities
    
    # Relation operations
    async def create_relation(self, relation: Relation) -> Relation:
        """Create a new relation."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO relations (
                    id, project_id, subject_id, predicate, object_id,
                    confidence, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                relation.id,
                relation.project_id,
                relation.subject_id,
                relation.predicate,
                relation.object_id,
                relation.confidence,
                relation.created_at
            )
        return relation
    
    async def get_relations_for_entity(
        self,
        entity_id: UUID,
        limit: int = 50
    ) -> List[Relation]:
        """Get all relations involving an entity."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM relations
                WHERE subject_id = $1 OR object_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                entity_id,
                limit
            )
            return [
                Relation(
                    id=row['id'],
                    project_id=row['project_id'],
                    subject_id=row['subject_id'],
                    predicate=row['predicate'],
                    object_id=row['object_id'],
                    confidence=row['confidence'],
                    created_at=row['created_at']
                )
                for row in rows
            ]
    
    # Provenance operations
    async def create_provenance(self, provenance: Provenance) -> Provenance:
        """Create provenance record (with encryption)."""
        import json
        prov_json = json.dumps({
            'source_type': provenance.source_type,
            'source_id': provenance.source_id,
            'source_url': provenance.source_url,
            'document_title': provenance.document_title,
            'chunk_id': provenance.chunk_id,
            'chunk_text': provenance.chunk_text,
            'extractor_name': provenance.extractor_name,
            'extractor_version': provenance.extractor_version,
            'extraction_method': provenance.extraction_method,
            'confidence': provenance.confidence,
            'metadata': provenance.metadata
        })
        
        ciphertext, nonce = encrypt_content(prov_json.encode(), self.encryption_key)
        
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO provenance (
                    id, fact_id, encrypted_data, nonce, tag, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                provenance.id,
                provenance.fact_id,
                ciphertext,
                nonce,
                b'',
                provenance.extracted_at
            )
        return provenance
    
    async def get_provenance_for_fact(self, fact_id: UUID) -> Optional[Provenance]:
        """Get provenance for a fact (with decryption)."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM provenance WHERE fact_id = $1",
                fact_id
            )
            if row:
                import json
                plaintext = decrypt_content(
                    bytes(row['encrypted_data']),
                    bytes(row['nonce']),
                    self.encryption_key
                )
                data = json.loads(plaintext.decode())
                
                return Provenance(
                    id=row['id'],
                    fact_id=row['fact_id'],
                    **data,
                    extracted_at=row['created_at']
                )
        return None
    
    # Audit operations
    async def append_audit_event(self, event: AuditEvent) -> AuditEvent:
        """Append event to audit chain."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO audit_events (
                    id, project_id, event_type, event_data, actor,
                    timestamp, prev_hash, current_hash
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                event.id,
                event.project_id,
                event.event_type,
                event.event_data,
                event.actor,
                event.timestamp,
                event.prev_hash,
                event.current_hash
            )
        return event
    
    async def get_audit_events(
        self,
        project_id: UUID,
        limit: int = 100,
        offset: int = 0
    ) -> List[AuditEvent]:
        """Get audit events for a project."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM audit_events
                WHERE project_id = $1
                ORDER BY timestamp ASC
                LIMIT $2 OFFSET $3
                """,
                project_id,
                limit,
                offset
            )
            return [
                AuditEvent(
                    id=row['id'],
                    project_id=row['project_id'],
                    event_type=row['event_type'],
                    event_data=row['event_data'],
                    actor=row['actor'],
                    timestamp=row['timestamp'],
                    prev_hash=bytes(row['prev_hash']),
                    current_hash=bytes(row['current_hash'])
                )
                for row in rows
            ]
    
    async def verify_audit_chain(self, project_id: UUID) -> bool:
        """Verify integrity of audit chain."""
        from cc_core.crypto import verify_chain_link
        
        events = await self.get_audit_events(project_id, limit=10000)
        
        for i, event in enumerate(events):
            if i == 0:
                # First event should have genesis hash
                if event.prev_hash != b'\x00' * 32:
                    return False
            else:
                # Verify chain link
                if event.prev_hash != events[i-1].current_hash:
                    return False
                
                if not verify_chain_link(
                    event.prev_hash,
                    event.current_hash,
                    event.event_type,
                    event.event_data,
                    event.actor,
                    event.timestamp.isoformat()
                ):
                    return False
        
        return True