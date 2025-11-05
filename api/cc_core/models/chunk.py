"""
Document chunk models
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel
from sqlalchemy import Column, String, Integer, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from pgvector.sqlalchemy import Vector
from cc_core.storage.database import Base
import uuid


class DocumentChunkDB(Base):
    """SQLAlchemy model for document_chunks table"""
    __tablename__ = "document_chunks"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(PGUUID(as_uuid=True), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)  # Will be deprecated in favor of encrypted_text
    encrypted_text = Column(Text, nullable=True)  # Encrypted content (base64)
    nonce = Column(String, nullable=True)  # Encryption nonce (hex)
    embedding = Column(Vector(384))  # all-MiniLM-L6-v2 dimension
    start_offset = Column(Integer, nullable=False)
    end_offset = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChunkResponse(BaseModel):
    """Schema for chunk response"""
    id: UUID
    document_id: UUID
    chunk_index: int
    text: str
    start_offset: int
    end_offset: int
    similarity: Optional[float] = None

    class Config:
        from_attributes = True