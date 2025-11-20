"""
User settings model for storing API keys and preferences
"""
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from cc_core.storage.database import Base


class UserSettingsDB(Base):
    """User settings including API keys and preferences"""
    __tablename__ = "user_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Encrypted API keys (encrypted with user's KEK)
    encrypted_api_keys = Column(JSONB, nullable=True)  # {provider: encrypted_key}
    api_keys_nonce = Column(Text, nullable=True)
    
    # Preferences (unencrypted)
    default_embedding_provider = Column(String(50), default="huggingface")
    default_model_name = Column(String(200), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("UserDB", back_populates="settings")


# Add relationship to UserDB
from cc_core.models.user import UserDB
UserDB.settings = relationship("UserSettingsDB", back_populates="user", uselist=False, cascade="all, delete-orphan")

