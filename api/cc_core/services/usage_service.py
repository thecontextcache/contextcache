"""
Usage Tracking Service with Tampering Prevention
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from cc_core.models.usage import UsageLogDB, UserQuotaDB
from cc_core.models.user import UserDB
from fastapi import HTTPException, status
from typing import Optional
import uuid
import os


class UsageService:
    """
    Track user usage and enforce limits
    Features:
    - Tamper-proof logging (hash-chained)
    - Real-time quota checking
    - Tier-based limits
    - Development mode bypass
    """
    
    def __init__(self):
        # Development mode: bypass all limits
        self.dev_mode = os.getenv("USAGE_ENFORCEMENT", "disabled") == "enabled"
    
    async def get_or_create_quota(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        tier: str = 'free'
    ) -> UserQuotaDB:
        """Get or create user quota record"""
        result = await db.execute(
            select(UserQuotaDB).where(UserQuotaDB.user_id == user_id)
        )
        quota = result.scalar_one_or_none()
        
        if not quota:
            # Create quota based on tier
            quota = UserQuotaDB(
                user_id=user_id,
                tier=tier,
                **self._get_tier_limits(tier)
            )
            db.add(quota)
            await db.commit()
            await db.refresh(quota)
        
        return quota
    
    def _get_tier_limits(self, tier: str) -> dict:
        """Get limits for each tier"""
        limits = {
            'free': {
                'documents_limit': 100,
                'facts_limit': 10000,
                'queries_limit': 1000,
                'api_calls_limit': 0,
            },
            'pro': {
                'documents_limit': 999999,  # Unlimited (high number)
                'facts_limit': 999999999,
                'queries_limit': 999999,
                'api_calls_limit': 100000,
            },
            'enterprise': {
                'documents_limit': 999999999,
                'facts_limit': 999999999,
                'queries_limit': 999999999,
                'api_calls_limit': 999999999,
            }
        }
        return limits.get(tier, limits['free'])
    
    async def check_and_enforce_limit(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        action_type: str,
        quantity: int = 1
    ) -> None:
        """
        Check if user has quota and enforce limits
        Raises HTTPException if limit exceeded
        
        In DEV mode: logs but doesn't enforce
        """
        quota = await self.get_or_create_quota(db, user_id)
        
        allowed, reason = quota.check_limit(action_type, quantity)
        
        if not allowed:
            if self.dev_mode:
                # Development: log but allow
                print(f"⚠️ DEV MODE: Would block {action_type} for user {user_id}: {reason}")
                return
            else:
                # Production: enforce
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Usage limit exceeded: {reason}. Please upgrade your plan."
                )
    
    async def log_usage(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        action_type: str,
        quantity: int = 1,
        resource_type: Optional[str] = None,
        resource_id: Optional[uuid.UUID] = None,
        project_id: Optional[uuid.UUID] = None,
        metadata: Optional[str] = None,
    ) -> UsageLogDB:
        """
        Log usage with tamper-proof hash chaining
        
        Steps:
        1. Get previous record's hash
        2. Create new record with previous_hash
        3. Compute and store record_hash
        4. Update user quota
        """
        # Get previous record's hash (for chain)
        result = await db.execute(
            select(UsageLogDB)
            .where(UsageLogDB.user_id == user_id)
            .order_by(UsageLogDB.created_at.desc())
            .limit(1)
        )
        previous_record = result.scalar_one_or_none()
        previous_hash = previous_record.record_hash if previous_record else None
        
        # Create new log entry
        log_entry = UsageLogDB(
            user_id=user_id,
            action_type=action_type,
            resource_type=resource_type,
            resource_id=resource_id,
            quantity=quantity,
            project_id=project_id,
            metadata=metadata,
            previous_hash=previous_hash,
            record_hash="",  # Will be computed
        )
        
        # Compute hash
        log_entry.record_hash = log_entry.compute_hash()
        
        db.add(log_entry)
        
        # Update quota
        quota = await self.get_or_create_quota(db, user_id)
        quota.increment_usage(action_type, quantity)
        
        await db.commit()
        await db.refresh(log_entry)
        
        return log_entry
    
    async def verify_usage_integrity(
        self,
        db: AsyncSession,
        user_id: uuid.UUID
    ) -> tuple[bool, str]:
        """
        Verify usage log integrity (detect tampering)
        Returns: (is_valid, message)
        """
        result = await db.execute(
            select(UsageLogDB)
            .where(UsageLogDB.user_id == user_id)
            .order_by(UsageLogDB.created_at.asc())
        )
        logs = result.scalars().all()
        
        if not logs:
            return True, "No usage logs to verify"
        
        # Check first record (should have no previous_hash)
        if logs[0].previous_hash is not None:
            return False, "First record has invalid previous_hash"
        
        # Verify each record's hash
        for log in logs:
            if not log.verify_integrity():
                return False, f"Record {log.id} has been tampered with"
        
        # Verify chain integrity
        for i in range(1, len(logs)):
            if logs[i].previous_hash != logs[i-1].record_hash:
                return False, f"Chain broken between records {logs[i-1].id} and {logs[i].id}"
        
        return True, "All records verified"
    
    async def get_user_usage_stats(
        self,
        db: AsyncSession,
        user_id: uuid.UUID
    ) -> dict:
        """Get current usage stats for a user"""
        quota = await self.get_or_create_quota(db, user_id)
        
        return {
            'tier': quota.tier,
            'documents': {
                'used': quota.documents_used,
                'limit': quota.documents_limit,
                'percentage': (quota.documents_used / quota.documents_limit * 100) if quota.documents_limit > 0 else 0
            },
            'facts': {
                'used': quota.facts_used,
                'limit': quota.facts_limit,
                'percentage': (quota.facts_used / quota.facts_limit * 100) if quota.facts_limit > 0 else 0
            },
            'queries': {
                'used': quota.queries_used,
                'limit': quota.queries_limit,
                'percentage': (quota.queries_used / quota.queries_limit * 100) if quota.queries_limit > 0 else 0
            },
            'locked': quota.locked,
            'lock_reason': quota.lock_reason,
        }

