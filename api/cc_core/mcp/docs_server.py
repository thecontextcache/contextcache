"""
Docs Server - Safe document fetching with domain allowlists
"""
from typing import Any, Dict, List
from urllib.parse import urlparse

import aiohttp

from cc_core.mcp.base import MCPServer


class DocsServer(MCPServer):
    """
    MCP server for safe document fetching.
    
    Enforces domain allowlists and provides document chunking.
    """
    
    def __init__(self, allowed_domains: List[str] = None):
        """
        Initialize docs server.
        
        Args:
            allowed_domains: List of allowed domains (e.g., ['wikipedia.org'])
                           If None, all domains allowed (use with caution)
        """
        super().__init__(name="docs_server", version="0.1.0")
        self.allowed_domains = allowed_domains or []
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        return [
            {
                "name": "fetch_document",
                "description": "Fetch document from URL with safety checks",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "URL to fetch"
                        }
                    },
                    "required": ["url"]
                }
            },
            {
                "name": "chunk_text",
                "description": "Split text into chunks for processing",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Text to chunk"
                        },
                        "chunk_size": {
                            "type": "integer",
                            "description": "Maximum chunk size in characters",
                            "default": 1000
                        },
                        "overlap": {
                            "type": "integer",
                            "description": "Overlap between chunks",
                            "default": 100
                        }
                    },
                    "required": ["text"]
                }
            }
        ]
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool."""
        if tool_name == "fetch_document":
            return await self._fetch_document(arguments["url"])
        elif tool_name == "chunk_text":
            return await self._chunk_text(
                arguments["text"],
                arguments.get("chunk_size", 1000),
                arguments.get("overlap", 100)
            )
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
    
    async def _fetch_document(self, url: str) -> Dict[str, Any]:
        """
        Fetch document from URL with safety checks.
        
        Args:
            url: URL to fetch
            
        Returns:
            Dict with 'content' and 'metadata'
            
        Raises:
            ValueError: If domain not allowed
        """
        # Validate domain
        parsed = urlparse(url)
        domain = parsed.netloc
        
        if self.allowed_domains and not self._is_domain_allowed(domain):
            raise ValueError(
                f"Domain {domain} not in allowlist. "
                f"Allowed domains: {', '.join(self.allowed_domains)}"
            )
        
        # Fetch document
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    response.raise_for_status()
                    content = await response.text()
                    
                    return {
                        "content": content,
                        "metadata": {
                            "url": url,
                            "status_code": response.status,
                            "content_type": response.content_type,
                            "content_length": len(content)
                        }
                    }
        except aiohttp.ClientError as e:
            raise ValueError(f"Failed to fetch document: {e}")
    
    async def _chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 100
    ) -> Dict[str, Any]:
        """
        Split text into overlapping chunks.
        
        Args:
            text: Text to chunk
            chunk_size: Maximum chunk size in characters
            overlap: Overlap between chunks
            
        Returns:
            Dict with 'chunks' list
        """
        if chunk_size <= overlap:
            raise ValueError("chunk_size must be greater than overlap")
        
        chunks = []
        start = 0
        text_length = len(text)
        
        while start < text_length:
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append({
                "text": chunk,
                "start": start,
                "end": min(end, text_length),
                "length": len(chunk)
            })
            start += chunk_size - overlap
        
        return {
            "chunks": chunks,
            "total_chunks": len(chunks),
            "metadata": {
                "original_length": text_length,
                "chunk_size": chunk_size,
                "overlap": overlap
            }
        }
    
    def _is_domain_allowed(self, domain: str) -> bool:
        """Check if domain is in allowlist."""
        # Remove www. prefix for comparison
        domain = domain.replace("www.", "")
        
        for allowed in self.allowed_domains:
            allowed = allowed.replace("www.", "")
            if domain == allowed or domain.endswith(f".{allowed}"):
                return True
        
        return False