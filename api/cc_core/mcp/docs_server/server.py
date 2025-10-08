"""
MCP Docs Server - Safe document fetching with allowlists
"""
import asyncio
from typing import List, Dict, Any
import httpx
from bs4 import BeautifulSoup
import PyPDF2
from io import BytesIO


class DocsServer:
    """
    MCP Server for document fetching and parsing
    Enforces domain allowlists and content policies
    """
    
    def __init__(self, allowed_domains: List[str] = None):
        self.allowed_domains = allowed_domains or [
            "arxiv.org",
            "wikipedia.org",
            "github.com",
            "*.edu"  # Educational institutions
        ]
        self.max_size_mb = 50
        self.timeout_seconds = 30
    
    def is_domain_allowed(self, url: str) -> bool:
        """Check if domain is in allowlist"""
        from urllib.parse import urlparse
        domain = urlparse(url).netloc
        
        for allowed in self.allowed_domains:
            if allowed.startswith("*."):
                # Wildcard match
                if domain.endswith(allowed[2:]):
                    return True
            elif domain == allowed or domain.endswith(f".{allowed}"):
                return True
        
        return False
    
    async def fetch_document(self, url: str) -> Dict[str, Any]:
        """
        Fetch and parse a document from URL
        
        MCP Tool: fetch_document
        Returns: {text, title, source_type, metadata}
        """
        if not self.is_domain_allowed(url):
            raise ValueError(f"Domain not allowed: {url}")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                timeout=self.timeout_seconds,
                follow_redirects=True
            )
            response.raise_for_status()
            
            # Check size
            content_length = len(response.content)
            if content_length > self.max_size_mb * 1024 * 1024:
                raise ValueError(f"Document too large: {content_length / (1024*1024):.1f} MB")
            
            content_type = response.headers.get("content-type", "")
            
            # Parse based on content type
            if "application/pdf" in content_type:
                return await self._parse_pdf(response.content, url)
            elif "text/html" in content_type:
                return await self._parse_html(response.content, url)
            elif "text/plain" in content_type:
                return {
                    "text": response.text,
                    "title": url.split("/")[-1],
                    "source_type": "text",
                    "url": url,
                    "metadata": {
                        "content_type": content_type,
                        "size_bytes": content_length
                    }
                }
            else:
                raise ValueError(f"Unsupported content type: {content_type}")
    
    async def _parse_pdf(self, content: bytes, url: str) -> Dict[str, Any]:
        """Parse PDF content"""
        pdf_reader = PyPDF2.PdfReader(BytesIO(content))
        text_parts = []
        
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        
        return {
            "text": "\n\n".join(text_parts),
            "title": url.split("/")[-1],
            "source_type": "pdf",
            "url": url,
            "metadata": {
                "page_count": len(pdf_reader.pages),
                "size_bytes": len(content)
            }
        }
    
    async def _parse_html(self, content: bytes, url: str) -> Dict[str, Any]:
        """Parse HTML content"""
        soup = BeautifulSoup(content, "lxml")
        
        # Remove unwanted elements
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.decompose()
        
        # Get title
        title = soup.title.string if soup.title else url.split("/")[-1]
        
        # Get text
        text = soup.get_text(separator="\n", strip=True)
        lines = (line.strip() for line in text.splitlines())
        text = "\n".join(line for line in lines if line)
        
        return {
            "text": text,
            "title": title,
            "source_type": "html",
            "url": url,
            "metadata": {
                "size_bytes": len(content)
            }
        }
    
    def get_mcp_tools(self) -> List[Dict[str, Any]]:
        """
        Return MCP tool definitions
        """
        return [
            {
                "name": "fetch_document",
                "description": "Fetch and parse a document from a URL. Supports PDF, HTML, and plain text.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "URL of the document to fetch"
                        }
                    },
                    "required": ["url"]
                }
            }
        ]