"""
Audit Server - Append/verify/export audit chain
"""
from typing import Any, Dict, List
from uuid import UUID

from cc_core.crypto import hash_audit_event, get_genesis_hash, hash_to_hex
from cc_core.mcp.base import MCPServer
from cc_core.models import AuditEvent
from cc_core.storage import StorageAdapter


class AuditServer(MCPServer):
    """
    MCP server for audit operations.
    
    Manages cryptographic audit chain with BLAKE3.
    """
    
    def __init__(self, storage: StorageAdapter):
        """
        Initialize audit server.
        
        Args:
            storage: Storage adapter instance
        """
        super().__init__(name="audit_server", version="0.1.0")
        self.storage = storage
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        return [
            {
                "name": "append_event",
                "description": "Append event to audit chain",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "Project UUID"},
                        "event_type": {"type": "string", "description": "Event type"},
                        "event_data": {"type": "object", "description": "Event payload"},
                        "actor": {"type": "string", "description": "Actor identifier"}
                    },
                    "required": ["project_id", "event_type", "event_data", "actor"]
                }
            },
            {
                "name": "verify_chain",
                "description": "Verify integrity of audit chain",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "Project UUID"}
                    },
                    "required": ["project_id"]
                }
            },
            {
                "name": "get_events",
                "description": "Get audit events for a project",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "Project UUID"},
                        "limit": {"type": "integer", "default": 100}
                    },
                    "required": ["project_id"]
                }
            }
        ]
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool."""
        if tool_name == "append_event":
            return await self._append_event(arguments)
        elif tool_name == "verify_chain":
            return await self._verify_chain(arguments)
        elif tool_name == "get_events":
            return await self._get_events(arguments)
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
    
    async def _append_event(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Append event to audit chain."""
        from datetime import datetime
        
        project_id = UUID(arguments["project_id"])
        
        # Get last event to link chain
        events = await self.storage.get_audit_events(project_id, limit=1)
        prev_hash = events[0].current_hash if events else get_genesis_hash()
        
        # Create event
        timestamp = datetime.utcnow()
        current_hash = hash_audit_event(
            prev_hash=prev_hash,
            event_type=arguments["event_type"],
            event_data=arguments["event_data"],
            actor=arguments["actor"],
            timestamp=timestamp.isoformat()
        )
        
        event = AuditEvent(
            project_id=project_id,
            event_type=arguments["event_type"],
            event_data=arguments["event_data"],
            actor=arguments["actor"],
            timestamp=timestamp,
            prev_hash=prev_hash,
            current_hash=current_hash
        )
        
        created = await self.storage.append_audit_event(event)
        
        return {
            "event_id": str(created.id),
            "prev_hash": hash_to_hex(prev_hash),
            "current_hash": hash_to_hex(current_hash),
            "status": "appended"
        }
    
    async def _verify_chain(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Verify audit chain integrity."""
        project_id = UUID(arguments["project_id"])
        
        valid = await self.storage.verify_audit_chain(project_id)
        events = await self.storage.get_audit_events(project_id, limit=10000)
        
        return {
            "valid": valid,
            "events_verified": len(events),
            "first_hash": hash_to_hex(events[0].current_hash) if events else None,
            "last_hash": hash_to_hex(events[-1].current_hash) if events else None
        }
    
    async def _get_events(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Get audit events."""
        project_id = UUID(arguments["project_id"])
        limit = arguments.get("limit", 100)
        
        events = await self.storage.get_audit_events(project_id, limit=limit)
        
        return {
            "events": [
                {
                    "id": str(e.id),
                    "event_type": e.event_type,
                    "event_data": e.event_data,
                    "actor": e.actor,
                    "timestamp": e.timestamp.isoformat(),
                    "prev_hash": hash_to_hex(e.prev_hash),
                    "current_hash": hash_to_hex(e.current_hash)
                }
                for e in events
            ],
            "total": len(events)
        }