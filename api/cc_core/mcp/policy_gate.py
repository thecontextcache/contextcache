"""
Policy Gate Server - Rate limits, allowlists, abuse controls
"""
from typing import Any, Dict, List

from cc_core.mcp.base import MCPServer


class PolicyGateServer(MCPServer):
    """
    MCP server for policy enforcement.
    
    Manages rate limits, domain allowlists, and abuse controls.
    """
    
    def __init__(self, redis_url: str = None):
        """
        Initialize policy gate server.
        
        Args:
            redis_url: Redis connection URL for rate limiting
                      If None, uses in-memory rate limiting (dev only)
        """
        super().__init__(name="policy_gate", version="0.1.0")
        self.redis_url = redis_url
        self.rate_limits = {}  # In-memory fallback for dev
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        return [
            {
                "name": "check_rate_limit",
                "description": "Check if action is allowed under rate limits",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string", "description": "Rate limit key (project_id or ip)"},
                        "action": {"type": "string", "description": "Action type (ingest, query, etc)"},
                        "tokens": {"type": "integer", "default": 1, "description": "Tokens to consume"}
                    },
                    "required": ["key", "action"]
                }
            },
            {
                "name": "check_domain",
                "description": "Check if domain is allowed",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "domain": {"type": "string", "description": "Domain to check"},
                        "allowlist": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["domain", "allowlist"]
                }
            },
            {
                "name": "get_limits",
                "description": "Get current rate limit configuration",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        ]
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool."""
        if tool_name == "check_rate_limit":
            return await self._check_rate_limit(arguments)
        elif tool_name == "check_domain":
            return await self._check_domain(arguments)
        elif tool_name == "get_limits":
            return await self._get_limits()
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
    
    async def _check_rate_limit(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Check rate limit using token bucket algorithm.
        
        In production, this uses Redis. For MVP, uses in-memory dict.
        """
        key = arguments["key"]
        action = arguments["action"]
        tokens = arguments.get("tokens", 1)
        
        # Rate limit configs (requests per minute)
        limits = {
            "ingest": 30,
            "extract": 30,
            "query": 120,
            "audit": 60
        }
        
        limit = limits.get(action, 60)
        
        # In-memory token bucket (MVP - replace with Redis in production)
        if key not in self.rate_limits:
            self.rate_limits[key] = {
                "tokens": limit,
                "last_refill": None
            }
        
        bucket = self.rate_limits[key]
        
        # Simple check (production would use proper token bucket with refill)
        if bucket["tokens"] >= tokens:
            bucket["tokens"] -= tokens
            return {
                "allowed": True,
                "remaining": bucket["tokens"],
                "limit": limit
            }
        else:
            return {
                "allowed": False,
                "remaining": bucket["tokens"],
                "limit": limit,
                "retry_after": 60  # seconds
            }
    
    async def _check_domain(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Check if domain is in allowlist."""
        domain = arguments["domain"].lower().replace("www.", "")
        allowlist = [d.lower().replace("www.", "") for d in arguments["allowlist"]]
        
        allowed = any(
            domain == allowed or domain.endswith(f".{allowed}")
            for allowed in allowlist
        )
        
        return {
            "allowed": allowed,
            "domain": domain,
            "reason": "in_allowlist" if allowed else "not_in_allowlist"
        }
    
    async def _get_limits(self) -> Dict[str, Any]:
        """Get rate limit configuration."""
        return {
            "limits": {
                "ingest": {"rpm": 30, "description": "Document ingestion"},
                "extract": {"rpm": 30, "description": "Fact extraction"},
                "query": {"rpm": 120, "description": "Fact queries"},
                "audit": {"rpm": 60, "description": "Audit operations"}
            },
            "note": "MVP uses in-memory limits. Production will use Redis token buckets."
        }