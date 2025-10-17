"""
Authentication module for ContextCache
Handles Clerk JWT verification and user management
"""

from cc_core.auth.clerk import get_current_user, get_optional_user

__all__ = ["get_current_user", "get_optional_user"]

