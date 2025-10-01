"""
Base MCP server interface
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List


class MCPServer(ABC):
    """
    Abstract base class for MCP servers.
    
    Each server exposes tools and resources via the MCP protocol.
    """
    
    def __init__(self, name: str, version: str = "0.1.0"):
        """
        Initialize MCP server.
        
        Args:
            name: Server name
            version: Server version
        """
        self.name = name
        self.version = version
    
    @abstractmethod
    async def list_tools(self) -> List[Dict[str, Any]]:
        """
        List available tools this server provides.
        
        Returns:
            List of tool definitions with name, description, input_schema
        """
        pass
    
    @abstractmethod
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool with given arguments.
        
        Args:
            tool_name: Name of tool to execute
            arguments: Tool arguments
            
        Returns:
            Tool execution result
            
        Raises:
            ValueError: If tool not found or arguments invalid
        """
        pass
    
    async def list_resources(self) -> List[Dict[str, Any]]:
        """
        List available resources this server provides.
        
        Returns:
            List of resource definitions (optional, default empty)
        """
        return []
    
    async def read_resource(self, resource_uri: str) -> Dict[str, Any]:
        """
        Read a resource by URI.
        
        Args:
            resource_uri: Resource identifier
            
        Returns:
            Resource content
        """
        raise NotImplementedError("This server does not provide resources")
    
    def get_info(self) -> Dict[str, str]:
        """Get server info."""
        return {
            "name": self.name,
            "version": self.version
        }