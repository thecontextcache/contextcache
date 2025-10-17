"""
User database models and schemas
Links Clerk authentication to our database
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from sqlalchemy import Column, String, LargeBinary, DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from cc_core.storage.database import Base
import uuid


class UserDB(Base):
    """SQLAlchemy model for users table"""
    __tablename__ = "users"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_user_id = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False)
    kek_salt = Column(LargeBinary, nullable=False)  # Salt for deriving KEK from passphrase
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserResponse(BaseModel):
    """Schema for user response"""
    id: UUID
    clerk_user_id: str
    email: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UnlockSessionRequest(BaseModel):
    """Schema for unlocking session"""
    master_passphrase: str = Field(..., min_length=20, description="Master passphrase to derive KEK")


class UnlockSessionResponse(BaseModel):
    """Schema for unlock session response"""
    status: str
    user_id: str
    session_id: str
    expires_in: int  # Seconds until expiry


class SessionStatusResponse(BaseModel):
    """Schema for session status response"""
    unlocked: bool
    session_id: Optional[str] = None
    message: Optional[str] = None

