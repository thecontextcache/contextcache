"""
Project database models and schemas
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from sqlalchemy import Column, String, LargeBinary, DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from cc_core.storage.database import Base
import uuid


class ProjectDB(Base):
    """SQLAlchemy model for projects table"""
    __tablename__ = "projects"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    salt = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProjectCreate(BaseModel):
    """Schema for creating a project"""
    name: str = Field(..., min_length=1, max_length=100)
    passphrase: str = Field(..., min_length=20)


class ProjectResponse(BaseModel):
    """Schema for project response"""
    id: UUID
    name: str
    salt: str  # Base64 encoded
    fact_count: int = 0
    entity_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True