"""
Authorization middleware and helpers
Ensures users can only access their own resources
"""
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from structlog import get_logger

logger = get_logger(__name__)


class AuthorizationError(HTTPException):
    """Custom exception for authorization failures"""
    def __init__(self, detail: str = "You don't have permission to access this resource"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail
        )


async def verify_project_ownership(
    project_id: str,
    user_id: str,
    db: AsyncSession
) -> bool:
    """
    Verify that a project belongs to the specified user
    
    Args:
        project_id: UUID of the project
        user_id: UUID of the user
        db: Database session
        
    Returns:
        True if user owns the project
        
    Raises:
        AuthorizationError: If user doesn't own the project
    """
    from cc_core.models.project import ProjectDB
    
    # Use parameterized query - SAFE from SQL injection
    result = await db.execute(
        select(ProjectDB).where(
            ProjectDB.id == project_id,
            ProjectDB.user_id == user_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        logger.warning(
            "authorization_failed",
            project_id=project_id,
            user_id=user_id,
            reason="project_not_found_or_not_owned"
        )
        raise AuthorizationError("Project not found or access denied")
    
    return True


async def verify_document_ownership(
    document_id: str,
    user_id: str,
    db: AsyncSession
) -> bool:
    """
    Verify that a document belongs to a project owned by the user
    
    Args:
        document_id: UUID of the document
        user_id: UUID of the user
        db: Database session
        
    Returns:
        True if user owns the document's project
        
    Raises:
        AuthorizationError: If user doesn't own the document
    """
    from cc_core.models.document import DocumentDB
    from cc_core.models.project import ProjectDB
    
    # Use parameterized query with JOIN - SAFE from SQL injection
    result = await db.execute(
        select(DocumentDB)
        .join(ProjectDB, DocumentDB.project_id == ProjectDB.id)
        .where(
            DocumentDB.id == document_id,
            ProjectDB.user_id == user_id
        )
    )
    document = result.scalar_one_or_none()
    
    if not document:
        logger.warning(
            "authorization_failed",
            document_id=document_id,
            user_id=user_id,
            reason="document_not_found_or_not_owned"
        )
        raise AuthorizationError("Document not found or access denied")
    
    return True


async def get_user_from_clerk_id(
    clerk_user_id: str,
    db: AsyncSession
) -> Optional[str]:
    """
    Get internal user ID from Clerk user ID
    
    Args:
        clerk_user_id: Clerk user identifier
        db: Database session
        
    Returns:
        Internal user UUID or None
    """
    from cc_core.models.user import UserDB
    
    # Use parameterized query - SAFE from SQL injection
    result = await db.execute(
        select(UserDB.id).where(UserDB.clerk_user_id == clerk_user_id)
    )
    user_id = result.scalar_one_or_none()
    
    if not user_id:
        logger.warning(
            "user_not_found",
            clerk_user_id=clerk_user_id
        )
    
    return str(user_id) if user_id else None


def require_ownership(resource_type: str):
    """
    Decorator to enforce resource ownership
    
    Usage:
        @require_ownership("project")
        async def get_project(project_id: str, user_id: str, db: AsyncSession):
            # This will only execute if user owns the project
            pass
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Extract required parameters
            project_id = kwargs.get('project_id')
            user_id = kwargs.get('user_id')
            db = kwargs.get('db')
            
            if not all([project_id, user_id, db]):
                raise ValueError("Missing required parameters for ownership check")
            
            # Verify ownership based on resource type
            if resource_type == "project":
                await verify_project_ownership(project_id, user_id, db)
            elif resource_type == "document":
                document_id = kwargs.get('document_id')
                await verify_document_ownership(document_id, user_id, db)
            else:
                raise ValueError(f"Unknown resource type: {resource_type}")
            
            # Execute the original function
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator

