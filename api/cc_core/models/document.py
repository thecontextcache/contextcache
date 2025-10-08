"""
Document database models and schemas
"""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from enum import Enum
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import Column, String, Integer, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from cc_core.storage.database import Base
import uuid


class DocumentStatus(str, Enum):
    """Document processing status"""
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class SourceType(str, Enum):
    """Document source type"""
    file = "file"
    url = "url"
    text = "text"


class DocumentDB(Base):
    """SQLAlchemy model for documents table"""
    __tablename__ = "documents"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(PGUUID(as_uuid=True), nullable=False)
    source_type = Column(String, nullable=False)
    source_url = Column(Text, nullable=True)
    content_hash = Column(String, nullable=False)  # SHA256 for deduplication
    status = Column(String, nullable=False, default="pending")
    fact_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)


class DocumentCreate(BaseModel):
    """Schema for creating a document"""
    project_id: UUID
    source_type: SourceType
    source_url: Optional[str] = None
    content: Optional[str] = None  # For text input


class DocumentResponse(BaseModel):
    """Schema for document response"""
    id: UUID
    project_id: UUID
    source_type: str
    source_url: Optional[str]
    content_hash: str
    status: str
    fact_count: int
    created_at: datetime
    processed_at: Optional[datetime]

    class Config:
        from_attributes = True


class DocumentChunk(BaseModel):
    """Text chunk from a document"""
    chunk_id: str
    text: str
    start_offset: int
    end_offset: int
    metadata: dict = {}