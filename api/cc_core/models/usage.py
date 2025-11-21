"""
Usage Tracking Model with Tampering Prevention
Tracks: documents, facts, queries, API calls
Uses: Cryptographic hashing to prevent tampering
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from cc_core.storage.database import Base
import hashlib
import json


class UsageLogDB(Base):
    """
    Immutable usage log with tampering prevention
    Each record is hash-chained to prevent modification
    """
    __tablename__ = "usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # What action was performed
    action_type = Column(String(50), nullable=False)  # 'document_upload', 'fact_extracted', 'query', 'api_call'
    resource_type = Column(String(50), nullable=True)  # 'document', 'fact', 'query'
    resource_id = Column(UUID(as_uuid=True), nullable=True)  # ID of the resource
    
    # Quantity (for billing)
    quantity = Column(Integer, default=1)  # e.g., 1 document, 100 facts, 1 query
    
    # Metadata
    project_id = Column(UUID(as_uuid=True), nullable=True)
    metadata = Column(Text, nullable=True)  # JSON string
    
    # Tampering prevention
    record_hash = Column(String(64), nullable=False)  # SHA256 of this record
    previous_hash = Column(String(64), nullable=True)  # Hash of previous record (blockchain-style)
    
    # Timestamps (immutable)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("UserDB", back_populates="usage_logs")

    def compute_hash(self) -> str:
        """
        Compute SHA256 hash of this record
        Used to detect tampering
        """
        record_data = {
            'id': str(self.id),
            'user_id': str(self.user_id),
            'action_type': self.action_type,
            'resource_type': self.resource_type,
            'resource_id': str(self.resource_id) if self.resource_id else None,
            'quantity': self.quantity,
            'project_id': str(self.project_id) if self.project_id else None,
            'metadata': self.metadata,
            'created_at': self.created_at.isoformat(),
            'previous_hash': self.previous_hash,
        }
        
        record_json = json.dumps(record_data, sort_keys=True)
        return hashlib.sha256(record_json.encode()).hexdigest()
    
    def verify_integrity(self) -> bool:
        """Check if this record has been tampered with"""
        expected_hash = self.compute_hash()
        return expected_hash == self.record_hash

    def __repr__(self):
        return f"<UsageLog(id={self.id}, user_id={self.user_id}, action={self.action_type}, qty={self.quantity})>"


class UserQuotaDB(Base):
    """
    Current usage vs quota for each user
    Updated in real-time, checked before operations
    """
    __tablename__ = "user_quotas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # User tier ('free', 'pro', 'enterprise')
    tier = Column(String(20), default='free', nullable=False)
    
    # Current usage (this billing period)
    documents_used = Column(Integer, default=0, nullable=False)
    facts_used = Column(Integer, default=0, nullable=False)
    queries_used = Column(Integer, default=0, nullable=False)
    api_calls_used = Column(Integer, default=0, nullable=False)
    
    # Quota limits (based on tier)
    documents_limit = Column(Integer, default=100, nullable=False)  # Free: 100
    facts_limit = Column(Integer, default=10000, nullable=False)  # Free: 10,000
    queries_limit = Column(Integer, default=1000, nullable=False)  # Free: 1,000/month
    api_calls_limit = Column(Integer, default=0, nullable=False)  # Free: 0 (no API access)
    
    # Billing period
    period_start = Column(DateTime, default=datetime.utcnow, nullable=False)
    period_end = Column(DateTime, nullable=True)
    
    # Lock status
    locked = Column(Boolean, default=False, nullable=False)
    lock_reason = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("UserDB", back_populates="quota")

    def check_limit(self, action_type: str, quantity: int = 1) -> tuple[bool, str]:
        """
        Check if user has quota available for this action
        Returns: (allowed: bool, reason: str)
        """
        if self.locked:
            return False, self.lock_reason or "Account locked"
        
        if action_type == 'document_upload':
            if self.documents_used + quantity > self.documents_limit:
                return False, f"Document limit reached ({self.documents_limit})"
        
        elif action_type == 'fact_extracted':
            if self.facts_used + quantity > self.facts_limit:
                return False, f"Fact limit reached ({self.facts_limit})"
        
        elif action_type == 'query':
            if self.queries_used + quantity > self.queries_limit:
                return False, f"Query limit reached ({self.queries_limit})"
        
        elif action_type == 'api_call':
            if self.tier == 'free':
                return False, "API access requires Pro plan"
            if self.api_calls_used + quantity > self.api_calls_limit:
                return False, f"API call limit reached ({self.api_calls_limit})"
        
        return True, ""
    
    def increment_usage(self, action_type: str, quantity: int = 1):
        """Increment usage counter (called after successful action)"""
        if action_type == 'document_upload':
            self.documents_used += quantity
        elif action_type == 'fact_extracted':
            self.facts_used += quantity
        elif action_type == 'query':
            self.queries_used += quantity
        elif action_type == 'api_call':
            self.api_calls_used += quantity

    def __repr__(self):
        return f"<UserQuota(user_id={self.user_id}, tier={self.tier}, docs={self.documents_used}/{self.documents_limit})>"

