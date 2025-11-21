"""
Admin Role Middleware
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cc_core.storage.database import get_db
from cc_core.models.user import UserDB
from cc_core.auth import get_current_user


async def require_admin(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> UserDB:
    """
    Dependency to require admin role
    Raises 403 if user is not admin
    """
    result = await db.execute(
        select(UserDB).where(UserDB.clerk_user_id == current_user["clerk_user_id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return user

