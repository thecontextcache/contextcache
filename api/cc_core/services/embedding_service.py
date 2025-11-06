"""
Embedding service for semantic search
Supports multiple providers: HuggingFace (sentence-transformers), Ollama, OpenAI
"""
from typing import List, Optional, Literal
import numpy as np
from sentence_transformers import SentenceTransformer
import os
from structlog import get_logger

logger = get_logger(__name__)

ProviderType = Literal["huggingface", "ollama", "openai"]


class EmbeddingService:
    """Service for creating text embeddings with multiple provider support"""

    def __init__(
        self,
        provider: ProviderType = "huggingface",
        model_name: Optional[str] = None
    ):
        """
        Initialize embedding service

        Args:
            provider: Embedding provider (huggingface, ollama, openai)
            model_name: Model name (provider-specific defaults if None)
        """
        self.provider = provider
        self.dimension = 384  # Default dimension

        if provider == "huggingface":
            model_name = model_name or "all-MiniLM-L6-v2"
            self.model = SentenceTransformer(model_name)
            self.dimension = self.model.get_sentence_embedding_dimension()
            logger.info("Initialized HuggingFace embeddings", model=model_name, dimension=self.dimension)

        elif provider == "ollama":
            # Lazy import to avoid dependency issues
            from cc_core.services.ollama_service import OllamaService
            self.ollama = OllamaService()
            self.model_name = model_name or "nomic-embed-text"
            self.dimension = 768  # nomic-embed-text dimension
            logger.info("Initialized Ollama embeddings", model=self.model_name)

        elif provider == "openai":
            self.model_name = model_name or "text-embedding-3-small"
            self.dimension = 1536  # OpenAI embedding dimension
            logger.info("Initialized OpenAI embeddings", model=self.model_name)

        else:
            raise ValueError(f"Unknown embedding provider: {provider}")
    
    async def embed_text(self, text: str) -> List[float]:
        """
        Create embedding vector for a single text

        Args:
            text: Input text

        Returns:
            Embedding vector as list of floats
        """
        if self.provider == "huggingface":
            embedding = self.model.encode(text, convert_to_numpy=True)
            return embedding.tolist()

        elif self.provider == "ollama":
            embedding = await self.ollama.generate_embedding(text, self.model_name)
            if embedding is None:
                raise RuntimeError("Failed to generate Ollama embedding")
            return embedding

        elif self.provider == "openai":
            import openai
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not set")

            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.embeddings.create(
                model=self.model_name,
                input=text
            )
            return response.data[0].embedding

        raise NotImplementedError(f"embed_text not implemented for provider: {self.provider}")
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Create embeddings for multiple texts (batch processing)

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors
        """
        if self.provider == "huggingface":
            embeddings = self.model.encode(texts, convert_to_numpy=True)
            return embeddings.tolist()

        elif self.provider == "ollama":
            embeddings = await self.ollama.generate_embeddings_batch(texts, self.model_name)
            # Filter out None values
            valid_embeddings = [e for e in embeddings if e is not None]
            if len(valid_embeddings) != len(texts):
                raise RuntimeError("Failed to generate some Ollama embeddings")
            return valid_embeddings

        elif self.provider == "openai":
            import openai
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not set")

            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.embeddings.create(
                model=self.model_name,
                input=texts
            )
            return [item.embedding for item in response.data]

        raise NotImplementedError(f"embed_batch not implemented for provider: {self.provider}")
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors
        
        Args:
            vec1: First vector
            vec2: Second vector
            
        Returns:
            Similarity score between -1 and 1
        """
        vec1_np = np.array(vec1)
        vec2_np = np.array(vec2)
        
        dot_product = np.dot(vec1_np, vec2_np)
        norm1 = np.linalg.norm(vec1_np)
        norm2 = np.linalg.norm(vec2_np)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))