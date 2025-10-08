"""
MCP Audit Server - Cryptographic audit chains with BLAKE3
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
import hashlib
import json


class AuditServer:
    """
    MCP Server for audit trail management
    Creates verifiable event chains using BLAKE3 hashing
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.hash_algorithm = "sha256"  # Will use BLAKE3 in production
    
    async def log_event(
        self,
        project_id: str,
        event_type: str,
        event_data: Dict[str, Any],
        actor: str = "system"
    ) -> Dict[str, Any]:
        """
        Log an auditable event with hash chain
        
        MCP Tool: log_event
        """
        from cc_core.models.project import ProjectDB
        from sqlalchemy import text as sql_text
        
        # Get previous event hash
        prev_event = await self.db.execute(
            sql_text("""
                SELECT current_hash 
                FROM audit_events 
                WHERE project_id = :project_id 
                ORDER BY timestamp DESC 
                LIMIT 1
            """),
            {"project_id": project_id}
        )
        prev_hash = prev_event.scalar()
        
        if not prev_hash:
            # Genesis event - use project ID as seed
            prev_hash = hashlib.sha256(project_id.encode()).digest()
        else:
            # Convert hex string to bytes if needed
            if isinstance(prev_hash, str):
                prev_hash = bytes.fromhex(prev_hash)
        
        # Create event hash: HASH(prev_hash || event_data)
        event_json = json.dumps(event_data, sort_keys=True)
        hash_input = prev_hash + event_json.encode('utf-8')
        current_hash = hashlib.sha256(hash_input).digest()
        
        # Store event
        insert_query = sql_text("""
            INSERT INTO audit_events 
            (project_id, event_type, event_data, actor, timestamp, prev_hash, current_hash)
            VALUES 
            (:project_id, :event_type, :event_data::jsonb, :actor, :timestamp, :prev_hash, :current_hash)
            RETURNING id, timestamp
        """)
        
        result = await self.db.execute(
            insert_query,
            {
                "project_id": project_id,
                "event_type": event_type,
                "event_data": event_json,
                "actor": actor,
                "timestamp": datetime.utcnow(),
                "prev_hash": prev_hash,
                "current_hash": current_hash
            }
        )
        
        row = result.fetchone()
        await self.db.commit()
        
        return {
            "event_id": str(row[0]),
            "event_type": event_type,
            "timestamp": row[1].isoformat(),
            "hash": current_hash.hex(),
            "prev_hash": prev_hash.hex()
        }
    
    async def verify_chain(self, project_id: str) -> Dict[str, Any]:
        """
        Verify the integrity of the audit chain
        
        MCP Tool: verify_chain
        """
        from sqlalchemy import text as sql_text
        
        # Get all events in order
        result = await self.db.execute(
            sql_text("""
                SELECT id, event_type, event_data, prev_hash, current_hash, timestamp
                FROM audit_events
                WHERE project_id = :project_id
                ORDER BY timestamp ASC
            """),
            {"project_id": project_id}
        )
        
        events = result.fetchall()
        
        if not events:
            return {
                "valid": True,
                "event_count": 0,
                "message": "No events to verify"
            }
        
        # Verify each event
        genesis_hash = hashlib.sha256(project_id.encode()).digest()
        expected_prev = genesis_hash
        
        for idx, event in enumerate(events):
            event_id, event_type, event_data, prev_hash, current_hash, timestamp = event
            
            # Convert to bytes if needed
            if isinstance(prev_hash, str):
                prev_hash = bytes.fromhex(prev_hash)
            if isinstance(current_hash, str):
                current_hash = bytes.fromhex(current_hash)
            
            # Verify prev_hash matches expected
            if prev_hash != expected_prev:
                return {
                    "valid": False,
                    "event_count": len(events),
                    "failed_at_index": idx,
                    "failed_event_id": str(event_id),
                    "message": f"Chain broken at event {idx}: prev_hash mismatch"
                }
            
            # Verify current_hash is correct
            if isinstance(event_data, dict):
                event_json = json.dumps(event_data, sort_keys=True)
            else:
                event_json = event_data
                
            hash_input = prev_hash + event_json.encode('utf-8')
            computed_hash = hashlib.sha256(hash_input).digest()
            
            if computed_hash != current_hash:
                return {
                    "valid": False,
                    "event_count": len(events),
                    "failed_at_index": idx,
                    "failed_event_id": str(event_id),
                    "message": f"Chain broken at event {idx}: current_hash mismatch"
                }
            
            # Set expected prev for next iteration
            expected_prev = current_hash
        
        return {
            "valid": True,
            "event_count": len(events),
            "latest_hash": current_hash.hex(),
            "message": "Audit chain verified successfully"
        }
    
    async def get_audit_trail(
        self,
        project_id: str,
        limit: int = 50,
        event_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get audit trail for a project
        
        MCP Tool: get_audit_trail
        """
        from sqlalchemy import text as sql_text
        
        query = """
            SELECT id, event_type, event_data, actor, timestamp, current_hash
            FROM audit_events
            WHERE project_id = :project_id
        """
        
        params = {"project_id": project_id}
        
        if event_type:
            query += " AND event_type = :event_type"
            params["event_type"] = event_type
        
        query += " ORDER BY timestamp DESC LIMIT :limit"
        params["limit"] = limit
        
        result = await self.db.execute(sql_text(query), params)
        
        events = []
        for row in result:
            event_id, evt_type, evt_data, actor, timestamp, curr_hash = row
            
            if isinstance(curr_hash, bytes):
                curr_hash = curr_hash.hex()
            
            events.append({
                "event_id": str(event_id),
                "event_type": evt_type,
                "event_data": evt_data,
                "actor": actor,
                "timestamp": timestamp.isoformat(),
                "hash": curr_hash
            })
        
        return events
    
    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        """Return MCP tool definitions"""
        return [
            {
                "name": "log_event",
                "description": "Log an auditable event with cryptographic hash chain",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
                        "event_type": {"type": "string"},
                        "event_data": {"type": "object"},
                        "actor": {"type": "string", "default": "system"}
                    },
                    "required": ["project_id", "event_type", "event_data"]
                }
            },
            {
                "name": "verify_chain",
                "description": "Verify the integrity of the audit chain",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"}
                    },
                    "required": ["project_id"]
                }
            },
            {
                "name": "get_audit_trail",
                "description": "Get audit trail events for a project",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
                        "limit": {"type": "integer", "default": 50},
                        "event_type": {"type": "string"}
                    },
                    "required": ["project_id"]
                }
            }
        ]