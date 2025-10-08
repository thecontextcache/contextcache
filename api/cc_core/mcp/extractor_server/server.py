"""
MCP Extractor Server - Extract facts/quads from text
Uses pattern matching and NLP for fact extraction
"""
import re
from typing import List, Dict, Any
from datetime import datetime
import hashlib


class ExtractorServer:
    """
    MCP Server for fact extraction
    Converts unstructured text into structured quads (subject, predicate, object, context)
    """
    
    def __init__(self):
        self.min_confidence = 0.5
        
        # Simple patterns for fact extraction (will improve with LLM later)
        self.patterns = [
            # "X discovered Y" pattern
            {
                "regex": r"(\w+(?:\s+\w+)*?)\s+(?:discovered|found)\s+(\w+(?:\s+\w+)*)",
                "predicate": "discovered",
            },
            # "X won Y" pattern
            {
                "regex": r"(\w+(?:\s+\w+)*?)\s+won\s+(?:the\s+)?(\w+(?:\s+\w+)*)",
                "predicate": "won",
            },
            # "X is a/an Y" pattern
            {
                "regex": r"(\w+(?:\s+\w+)*?)\s+(?:is|was)\s+(?:a|an)\s+(\w+(?:\s+\w+)*)",
                "predicate": "is_a",
            },
            # Email pattern
            {
                "regex": r"(\w+(?:\s+\w+)*?)\s+(?:Email|email)(?:\s*[-:]\s*)(\S+@\S+)",
                "predicate": "has_email",
            },
            # Phone pattern
            {
                "regex": r"(\w+(?:\s+\w+)*?)\s+(?:Ph\s*No|Phone)(?:\s*[-:]\s*)([\d\s\-\+\(\)]+)",
                "predicate": "has_phone",
            },
        ]
    
    def extract_facts(
        self, 
        text: str, 
        source_url: str = None,
        document_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Extract facts from text
        
        MCP Tool: extract_facts
        Returns: List of {subject, predicate, object, context, confidence, provenance}
        """
        facts = []
        sentences = self._split_sentences(text)
        
        for sentence_idx, sentence in enumerate(sentences):
            # Try each pattern
            for pattern in self.patterns:
                matches = re.finditer(pattern["regex"], sentence, re.IGNORECASE)
                
                for match in matches:
                    subject = match.group(1).strip()
                    obj = match.group(2).strip()
                    predicate = pattern["predicate"]
                    
                    # Calculate confidence (simple heuristic for now)
                    confidence = self._calculate_confidence(sentence, match)
                    
                    if confidence >= self.min_confidence:
                        fact_id = self._generate_fact_id(subject, predicate, obj)
                        
                        facts.append({
                            "id": fact_id,
                            "subject": subject,
                            "predicate": predicate,
                            "object": obj,
                            "context": sentence,
                            "confidence": confidence,
                            "provenance": {
                                "source_url": source_url,
                                "document_id": document_id,
                                "sentence_index": sentence_idx,
                                "extracted_at": datetime.utcnow().isoformat(),
                                "method": "pattern_matching"
                            }
                        })
        
        return facts
    
    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences"""
        # Simple sentence splitter
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _calculate_confidence(self, sentence: str, match: re.Match) -> float:
        """
        Calculate confidence score for extracted fact
        
        Factors:
        - Pattern match quality
        - Sentence clarity
        - Subject/object specificity
        """
        base_confidence = 0.7
        
        # Longer subjects/objects are more specific
        subject_len = len(match.group(1).split())
        obj_len = len(match.group(2).split())
        
        specificity_bonus = min(0.2, (subject_len + obj_len) * 0.05)
        
        # Shorter sentences are clearer
        sentence_len = len(sentence.split())
        clarity_bonus = 0.1 if sentence_len < 20 else 0
        
        total = base_confidence + specificity_bonus + clarity_bonus
        return min(1.0, total)
    
    def _generate_fact_id(self, subject: str, predicate: str, obj: str) -> str:
        """Generate deterministic fact ID"""
        content = f"{subject}|{predicate}|{obj}".lower()
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        """Return MCP tool definitions"""
        return [
            {
                "name": "extract_facts",
                "description": "Extract structured facts (quads) from unstructured text",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Text to extract facts from"
                        },
                        "source_url": {
                            "type": "string",
                            "description": "Source URL of the text (optional)"
                        },
                        "document_id": {
                            "type": "string",
                            "description": "Document ID (optional)"
                        }
                    },
                    "required": ["text"]
                }
            }
        ]