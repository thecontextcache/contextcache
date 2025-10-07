"""
Document processing service
Handles PDF parsing, URL fetching, and text chunking
"""
import hashlib
import re
from typing import List, Tuple
from io import BytesIO
import PyPDF2
import httpx
from bs4 import BeautifulSoup


class DocumentService:
    """Service for document processing"""
    
    @staticmethod
    async def extract_text_from_pdf(file_content: bytes) -> str:
        """Extract text from PDF file"""
        try:
            pdf_reader = PyPDF2.PdfReader(BytesIO(file_content))
            text_parts = []
            
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            
            return "\n\n".join(text_parts)
        except Exception as e:
            raise ValueError(f"Failed to parse PDF: {str(e)}")
    
    @staticmethod
    async def fetch_url_content(url: str) -> Tuple[str, str]:
        """Fetch and extract text from URL"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30.0, follow_redirects=True)
                response.raise_for_status()
                
                content_type = response.headers.get("content-type", "")
                
                # Handle PDF URLs
                if "application/pdf" in content_type:
                    text = await DocumentService.extract_text_from_pdf(response.content)
                    return text, "PDF from URL"
                
                # Handle HTML
                soup = BeautifulSoup(response.content, "lxml")
                
                # Remove script and style elements
                for script in soup(["script", "style", "nav", "footer", "header"]):
                    script.decompose()
                
                # Get title
                title = soup.title.string if soup.title else "Untitled"
                
                # Get text
                text = soup.get_text(separator="\n", strip=True)
                
                # Clean up whitespace
                lines = (line.strip() for line in text.splitlines())
                text = "\n".join(line for line in lines if line)
                
                return text, title
        except Exception as e:
            raise ValueError(f"Failed to fetch URL: {str(e)}")
    
    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[dict]:
        """
        Split text into overlapping chunks
        
        Args:
            text: Input text
            chunk_size: Target size of each chunk (characters)
            overlap: Number of overlapping characters between chunks
        
        Returns:
            List of chunk dictionaries with text and metadata
        """
        # Clean the text
        text = re.sub(r'\s+', ' ', text).strip()
        
        if len(text) <= chunk_size:
            return [{
                "chunk_id": "chunk-0",
                "text": text,
                "start_offset": 0,
                "end_offset": len(text),
                "metadata": {}
            }]
        
        chunks = []
        start = 0
        chunk_id = 0
        
        while start < len(text):
            # Calculate end position
            end = start + chunk_size
            
            # If not the last chunk, try to break at sentence boundary
            if end < len(text):
                # Look for sentence boundaries (., !, ?)
                sentence_end = max(
                    text.rfind('. ', start, end),
                    text.rfind('! ', start, end),
                    text.rfind('? ', start, end)
                )
                
                if sentence_end > start:
                    end = sentence_end + 1
            
            chunk_text = text[start:end].strip()
            
            if chunk_text:
                chunks.append({
                    "chunk_id": f"chunk-{chunk_id}",
                    "text": chunk_text,
                    "start_offset": start,
                    "end_offset": end,
                    "metadata": {
                        "chunk_index": chunk_id,
                        "total_chunks": 0  # Will update later
                    }
                })
                chunk_id += 1
            
            # Move to next chunk with overlap
            start = end - overlap if end < len(text) else end
        
        # Update total_chunks in metadata
        for chunk in chunks:
            chunk["metadata"]["total_chunks"] = len(chunks)
        
        return chunks
    
    @staticmethod
    def compute_content_hash(content: str) -> str:
        """Compute SHA256 hash of content for deduplication"""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()