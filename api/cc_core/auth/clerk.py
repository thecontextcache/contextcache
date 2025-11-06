"""
Clerk JWT verification for FastAPI
Verifies Clerk-issued JWTs and extracts user information
"""
import os
from typing import Optional
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, jwk
from jose.utils import base64url_decode
import httpx
from functools import lru_cache
import json

# Clerk configuration from environment
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
CLERK_PUBLISHABLE_KEY = os.getenv("CLERK_PUBLISHABLE_KEY", "")
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "")

# Extract domain from publishable key if issuer not set
if not CLERK_ISSUER and CLERK_PUBLISHABLE_KEY:
    # Format: pk_test_xxx or pk_live_xxx
    if CLERK_PUBLISHABLE_KEY.startswith("pk_test_"):
        CLERK_ISSUER = "https://clerk.accounts.dev"
    elif CLERK_PUBLISHABLE_KEY.startswith("pk_live_"):
        # Extract from key or use default
        CLERK_ISSUER = "https://accounts.clerk.com"

security = HTTPBearer()


@lru_cache(maxsize=1)
def get_clerk_jwks():
    """
    Fetch Clerk's JWKS (JSON Web Key Set) for JWT verification
    Cached to avoid repeated requests
    """
    if not CLERK_ISSUER:
        raise ValueError("CLERK_ISSUER not configured")
    
    # Clerk's JWKS endpoint
    jwks_url = f"{CLERK_ISSUER}/.well-known/jwks.json"
    
    try:
        response = httpx.get(jwks_url, timeout=10.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f" Failed to fetch Clerk JWKS: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch authentication keys"
        )


def verify_clerk_token(token: str) -> dict:
    """
    Verify Clerk JWT token and return payload
    
    Args:
        token: JWT token from Authorization header
        
    Returns:
        dict: Decoded JWT payload containing user info
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Get unverified header to extract kid (key ID)
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing key ID"
            )
        
        # Get JWKS and find matching key
        jwks = get_clerk_jwks()
        key = None
        
        for jwk_key in jwks.get("keys", []):
            if jwk_key.get("kid") == kid:
                key = jwk_key
                break
        
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token key not found in JWKS"
            )
        
        # Verify and decode token
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_iss": True,
            }
        )
        
        return payload
        
    except JWTError as e:
        print(f" JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        print(f" Unexpected error during token verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication error"
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    FastAPI dependency to get current authenticated user
    
    Usage:
        @app.get("/protected")
        async def protected_route(current_user: dict = Depends(get_current_user)):
            return {"user_id": current_user["user_id"]}
    
    Returns:
        dict: User information from JWT
            - user_id: Clerk user ID (sub claim)
            - session_id: Clerk session ID (sid claim)
            - email: User's email (if available)
            - raw_payload: Full JWT payload
    """
    token = credentials.credentials
    payload = verify_clerk_token(token)
    
    # Extract standard Clerk claims
    user_info = {
        "clerk_user_id": payload.get("sub"),  # Clerk's user ID
        "session_id": payload.get("sid"),  # Session ID
        "email": payload.get("email"),  # Email (if available)
        "raw_payload": payload,  # Full payload for debugging
    }
    
    if not user_info["clerk_user_id"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID"
        )
    
    return user_info


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    )
) -> Optional[dict]:
    """
    FastAPI dependency to get current user if authenticated, None otherwise
    
    Usage:
        @app.get("/public")
        async def public_route(current_user: dict | None = Depends(get_optional_user)):
            if current_user:
                return {"message": f"Hello {current_user['user_id']}"}
            return {"message": "Hello anonymous"}
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


# Utility function to check if Clerk is properly configured
def is_clerk_configured() -> bool:
    """Check if required Clerk environment variables are set"""
    return bool(CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY and CLERK_ISSUER)


# Print configuration status on module load
if __name__ != "__main__":
    if is_clerk_configured():
        print(f" Clerk authentication configured (issuer: {CLERK_ISSUER})")
    else:
        print(" Clerk not fully configured. Set CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, and CLERK_ISSUER")

