"""
Security middleware for ContextCache API
"""
from .error_handler import SecureErrorHandler, register_error_handlers
from .authorization import (
    AuthorizationError,
    verify_project_ownership,
    verify_document_ownership,
    get_user_from_clerk_id,
    require_ownership
)

__all__ = [
    "SecureErrorHandler",
    "register_error_handlers",
    "AuthorizationError",
    "verify_project_ownership",
    "verify_document_ownership",
    "get_user_from_clerk_id",
    "require_ownership",
]

