"""
MCP Policy Gate - Rate limiting, domain allowlists, security policies
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import redis.asyncio as redis
from urllib.parse import urlparse


class PolicyGate:
    """
    MCP Server for policy enforcement
    Manages rate limits, domain allowlists, and security policies
    """
    
    def __init__(self, redis_url: str = None):
        self.redis_url = redis_url or "redis://localhost:6379"
        self.redis_client = None
        
        # Default policies
        self.policies = {
            "rate_limits": {
                "light_read": 120,      # per minute per project
                "ingest": 30,           # per minute per project
                "extract": 30,          # per minute per project
                "ip_global": 300        # per minute per IP
            },
            "allowed_domains": [
                "arxiv.org",
                "wikipedia.org",
                "github.com",
                "*.edu",
                "*.gov"
            ],
            "max_document_size_mb": 50,
            "max_chunk_size": 2000,
            "timeout_seconds": 30
        }
    
    async def connect(self):
        """Initialize Redis connection"""
        if not self.redis_client:
            self.redis_client = await redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
    
    async def check_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int = 60
    ) -> Dict[str, Any]:
        """
        Check rate limit using token bucket
        
        MCP Tool: check_rate_limit
        """
        await self.connect()
        
        now = datetime.utcnow().timestamp()
        window_start = now - window_seconds
        
        # Remove old entries
        await self.redis_client.zremrangebyscore(key, 0, window_start)
        
        # Count requests in window
        count = await self.redis_client.zcard(key)
        
        if count >= limit:
            # Rate limit exceeded
            ttl = await self.redis_client.ttl(key)
            return {
                "allowed": False,
                "limit": limit,
                "remaining": 0,
                "reset_in_seconds": ttl if ttl > 0 else window_seconds,
                "message": f"Rate limit exceeded: {count}/{limit}"
            }
        
        # Add current request
        await self.redis_client.zadd(key, {str(now): now})
        await self.redis_client.expire(key, window_seconds)
        
        return {
            "allowed": True,
            "limit": limit,
            "remaining": limit - count - 1,
            "reset_in_seconds": window_seconds,
            "message": "Request allowed"
        }
    
    def check_domain_allowed(self, url: str) -> Dict[str, Any]:
        """
        Check if domain is in allowlist
        
        MCP Tool: check_domain
        """
        domain = urlparse(url).netloc
        
        for allowed in self.policies["allowed_domains"]:
            if allowed.startswith("*."):
                # Wildcard match
                if domain.endswith(allowed[2:]):
                    return {
                        "allowed": True,
                        "domain": domain,
                        "matched_pattern": allowed
                    }
            elif domain == allowed or domain.endswith(f".{allowed}"):
                return {
                    "allowed": True,
                    "domain": domain,
                    "matched_pattern": allowed
                }
        
        return {
            "allowed": False,
            "domain": domain,
            "message": f"Domain not in allowlist: {domain}"
        }
    
    def get_policy(self, policy_name: str) -> Any:
        """
        Get a specific policy value
        
        MCP Tool: get_policy
        """
        parts = policy_name.split(".")
        value = self.policies
        
        for part in parts:
            if isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return None
        
        return value
    
    async def enforce_policies(
        self,
        project_id: str,
        operation: str,
        url: Optional[str] = None,
        document_size_mb: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Enforce all relevant policies
        
        MCP Tool: enforce_policies
        """
        violations = []
        
        # Check rate limit
        limit_key = f"rate_limit:{project_id}:{operation}"
        limit = self.policies["rate_limits"].get(operation, 100)
        
        rate_check = await self.check_rate_limit(limit_key, limit)
        if not rate_check["allowed"]:
            violations.append({
                "type": "rate_limit",
                "message": rate_check["message"]
            })
        
        # Check domain if URL provided
        if url:
            domain_check = self.check_domain_allowed(url)
            if not domain_check["allowed"]:
                violations.append({
                    "type": "domain_allowlist",
                    "message": domain_check["message"]
                })
        
        # Check document size if provided
        if document_size_mb:
            max_size = self.policies["max_document_size_mb"]
            if document_size_mb > max_size:
                violations.append({
                    "type": "document_size",
                    "message": f"Document too large: {document_size_mb}MB > {max_size}MB"
                })
        
        return {
            "allowed": len(violations) == 0,
            "violations": violations,
            "rate_limit_info": rate_check
        }
    
    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        """Return MCP tool definitions"""
        return [
            {
                "name": "check_rate_limit",
                "description": "Check if rate limit allows the request",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string"},
                        "limit": {"type": "integer"},
                        "window_seconds": {"type": "integer", "default": 60}
                    },
                    "required": ["key", "limit"]
                }
            },
            {
                "name": "check_domain",
                "description": "Check if domain is in allowlist",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"}
                    },
                    "required": ["url"]
                }
            },
            {
                "name": "enforce_policies",
                "description": "Enforce all relevant security policies",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
                        "operation": {"type": "string"},
                        "url": {"type": "string"},
                        "document_size_mb": {"type": "number"}
                    },
                    "required": ["project_id", "operation"]
                }
            },
            {
                "name": "get_policy",
                "description": "Get a specific policy value",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "policy_name": {"type": "string"}
                    },
                    "required": ["policy_name"]
                }
            }
        ]