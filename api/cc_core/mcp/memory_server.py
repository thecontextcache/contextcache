"""
Memory Server - Add/query facts with ranking
"""
from typing import Any, Dict, List
from uuid import UUID

from cc_core.mcp.base import MCPServer
from cc_core.storage import StorageAdapter


class MemoryServer(MCPServer):
    """
    MCP server for memory operations.
    
    Manages facts in the knowledge graph with ranking and decay.
    """
    
    def __init__(self, storage: StorageAdapter):
        """
        Initialize memory server.
        
        Args:
            storage: Storage adapter instance
        """
        super().__init__(name="memory_server", version="0.1.0")
        self.storage = storage
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        return [
            {
                "name": "add_fact",
                "description": "Add a new fact to memory",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "Project UUID"},
                        "subject": {"type": "string"},
                        "predicate": {"type": "string"},
                        "object": {"type": "string"},
                        "context": {"type": "string"},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1}
                    },
                    "required": ["project_id", "subject", "predicate", "object", "context"]
                }
            },
            {
                "name": "query_facts",
                "description": "Query facts from memory with ranking",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "Project UUID"},
                        "limit": {"type": "integer", "default": 20},
                        "min_confidence": {"type": "number", "default": 0.0}
                    },
                    "required": ["project_id"]
                }
            },
            {
                "name": "update_scores",
                "description": "Update fact ranking scores",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "fact_id": {"type": "string", "description": "Fact UUID"},
                        "rank_score": {"type": "number", "minimum": 0, "maximum": 1},
                        "decay_factor": {"type": "number", "minimum": 0, "maximum": 1}
                    },
                    "required": ["fact_id"]
                }
            }
        ]
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool."""
        if tool_name == "add_fact":
            return await self._add_fact(arguments)
        elif tool_name == "query_facts":
            return await self._query_facts(arguments)
        elif tool_name == "update_scores":
            return await self._update_scores(arguments)
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
    
    async def _add_fact(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Add a fact to memory."""
        from cc_core.models import Fact
        
        fact = Fact(
            project_id=UUID(arguments["project_id"]),
            subject=arguments["subject"],
            predicate=arguments["predicate"],
            object=arguments["object"],
            context=arguments["context"],
            confidence=arguments.get("confidence", 1.0),
            embedding=None,
            rank_score=0.0,
            decay_factor=1.0
        )
        
        created = await self.storage.create_fact(fact)
        
        return {
            "fact_id": str(created.id),
            "status": "created"
        }
    
    async def _query_facts(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Query facts from memory."""
        project_id = UUID(arguments["project_id"])
        limit = arguments.get("limit", 20)
        min_confidence = arguments.get("min_confidence", 0.0)
        
        facts = await self.storage.list_facts(
            project_id=project_id,
            limit=limit,
            min_confidence=min_confidence
        )
        
        return {
            "facts": [
                {
                    "id": str(f.id),
                    "subject": f.subject,
                    "predicate": f.predicate,
                    "object": f.object,
                    "context": f.context,
                    "confidence": f.confidence,
                    "rank_score": f.rank_score,
                    "decay_factor": f.decay_factor
                }
                for f in facts
            ],
            "total": len(facts)
        }
    
    async def _update_scores(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Update fact scores."""
        fact_id = UUID(arguments["fact_id"])
        rank_score = arguments.get("rank_score")
        decay_factor = arguments.get("decay_factor")
        
        success = await self.storage.update_fact_scores(
            fact_id=fact_id,
            rank_score=rank_score,
            decay_factor=decay_factor
        )
        
        return {
            "fact_id": str(fact_id),
            "updated": success
        }