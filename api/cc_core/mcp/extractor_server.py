"""
Extractor Server - Text → quads extraction with provenance
"""
import json
from datetime import datetime
from typing import Any, Dict, List
from cc_core.mcp.base import MCPServer
from cc_core.models import Fact, Provenance
from uuid import UUID, uuid4

class ExtractorServer(MCPServer):
    """
    MCP server for knowledge extraction.
    
    Extracts structured facts (quads) from unstructured text.
    """
    
    def __init__(self, extractor_name: str = "default_extractor", version: str = "0.1.0"):
        """
        Initialize extractor server.
        
        Args:
            extractor_name: Name of extraction algorithm
            version: Extractor version
        """
        super().__init__(name="extractor_server", version=version)
        self.extractor_name = extractor_name
        self.extractor_version = version
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        return [
            {
                "name": "extract_facts",
                "description": "Extract structured facts from text",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Text to extract facts from"
                        },
                        "source_type": {
                            "type": "string",
                            "description": "Source type (document, url, user_input)",
                            "default": "user_input"
                        },
                        "source_id": {
                            "type": "string",
                            "description": "Source identifier"
                        },
                        "project_id": {
                            "type": "string",
                            "description": "Project UUID"
                        }
                    },
                    "required": ["text", "project_id"]
                }
            }
        ]
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool."""
        if tool_name == "extract_facts":
            return await self._extract_facts(
                text=arguments["text"],
                project_id=arguments["project_id"],
                source_type=arguments.get("source_type", "user_input"),
                source_id=arguments.get("source_id", "manual")
            )
        else:
            raise ValueError(f"Unknown tool: {tool_name}")
    
    async def _extract_facts(
        self,
        text: str,
        project_id: str,
        source_type: str = "user_input",
        source_id: str = "manual"
    ) -> Dict[str, Any]:
        """
        Extract facts from text.
        
        This is a simplified rule-based extractor for MVP.
        In production, this would use an LLM or trained model.
        
        Args:
            text: Text to extract from
            project_id: Project UUID
            source_type: Source type
            source_id: Source identifier
            
        Returns:
            Dict with extracted facts and provenance
        """
        # Simple sentence-based extraction (MVP implementation)

        sentences = self._split_sentences(text)
        
        facts = []
        provenance_records = []
        
        for i, sentence in enumerate(sentences):
            # Skip very short sentences
            if len(sentence.split()) < 3:
                continue
            
            # Simple heuristic extraction
            # Format: "Subject verb object context"
            words = sentence.split()
            
            if len(words) >= 3:
                fact_id = uuid4()
                
                # Naive extraction (will be replaced with LLM)
                subject = words[0]
                predicate = words[1] if len(words) > 1 else "relates_to"
                obj = words[2] if len(words) > 2 else ""
                context = sentence
                
                # Create fact
                fact = Fact(
                    id=fact_id,
                    project_id=UUID(project_id),
                    subject=subject,
                    predicate=predicate,
                    object=obj,
                    context=context,
                    confidence=0.7,  # Lower confidence for rule-based
                    embedding=None,  # Will be computed later
                    rank_score=0.0,
                    decay_factor=1.0
                )
                
                # Create provenance
                prov = Provenance(
                    id=uuid4(),
                    fact_id=fact_id,
                    source_type=source_type,
                    source_id=source_id,
                    chunk_text=sentence,
                    chunk_id=f"chunk-{i}",
                    extractor_name=self.extractor_name,
                    extractor_version=self.extractor_version,
                    extraction_method="rule_based",
                    confidence=0.7,
                    extracted_at=datetime.utcnow()
                )
                
                facts.append(fact.model_dump(mode='json'))
                provenance_records.append(prov.model_dump(mode='json'))
        
        return {
            "facts": facts,
            "provenance": provenance_records,
            "metadata": {
                "total_facts": len(facts),
                "extractor": self.extractor_name,
                "method": "rule_based",
                "note": "MVP implementation - will be replaced with LLM extraction"
            }
        }
    
    def _split_sentences(self, text: str) -> List[str]:
        """
        Simple sentence splitter.
        
        In production, use proper sentence tokenization (nltk, spaCy).
        """
        # Basic sentence splitting on punctuation
        import re
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]