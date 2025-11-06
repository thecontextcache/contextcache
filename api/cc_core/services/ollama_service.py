"""
Ollama integration service for local LLM embeddings and completion
"""
import os
from typing import List, Optional, Dict, Any
import httpx
from structlog import get_logger

logger = get_logger(__name__)


class OllamaService:
    """Service for interacting with local Ollama server"""

    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize Ollama service

        Args:
            base_url: Ollama server URL (defaults to http://localhost:11434)
        """
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.timeout = float(os.getenv("OLLAMA_TIMEOUT", "30.0"))

    async def is_available(self) -> bool:
        """
        Check if Ollama server is running and available

        Returns:
            True if server is available, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception as e:
            logger.debug("Ollama not available", error=str(e))
            return False

    async def list_models(self) -> List[Dict[str, Any]]:
        """
        List available models on Ollama server

        Returns:
            List of model information dictionaries
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
                return data.get("models", [])
        except Exception as e:
            logger.error("Failed to list Ollama models", error=str(e))
            return []

    async def generate_embedding(
        self,
        text: str,
        model: str = "nomic-embed-text"
    ) -> Optional[List[float]]:
        """
        Generate embedding for text using Ollama

        Args:
            text: Text to embed
            model: Model to use (default: nomic-embed-text)

        Returns:
            Embedding vector as list of floats, or None if failed
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json={
                        "model": model,
                        "prompt": text
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data.get("embedding")
        except Exception as e:
            logger.error(
                "Failed to generate Ollama embedding",
                error=str(e),
                model=model
            )
            return None

    async def generate_embeddings_batch(
        self,
        texts: List[str],
        model: str = "nomic-embed-text"
    ) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts (sequential)

        Args:
            texts: List of texts to embed
            model: Model to use

        Returns:
            List of embedding vectors
        """
        embeddings = []
        for text in texts:
            embedding = await self.generate_embedding(text, model)
            embeddings.append(embedding)
        return embeddings

    async def generate_completion(
        self,
        prompt: str,
        model: str = "llama3.2",
        system: Optional[str] = None,
        stream: bool = False
    ) -> Optional[str]:
        """
        Generate text completion using Ollama

        Args:
            prompt: User prompt
            model: Model to use (default: llama3.2)
            system: System prompt (optional)
            stream: Whether to stream response (not implemented)

        Returns:
            Generated text, or None if failed
        """
        try:
            payload: Dict[str, Any] = {
                "model": model,
                "prompt": prompt,
                "stream": False  # For simplicity, always non-streaming
            }

            if system:
                payload["system"] = system

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json=payload
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response")
        except Exception as e:
            logger.error(
                "Failed to generate Ollama completion",
                error=str(e),
                model=model
            )
            return None

    async def pull_model(self, model: str) -> bool:
        """
        Pull/download a model from Ollama library

        Args:
            model: Model name to pull

        Returns:
            True if successful, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:  # 5 min timeout for download
                response = await client.post(
                    f"{self.base_url}/api/pull",
                    json={"name": model, "stream": False}
                )
                response.raise_for_status()
                logger.info("Ollama model pulled successfully", model=model)
                return True
        except Exception as e:
            logger.error(
                "Failed to pull Ollama model",
                error=str(e),
                model=model
            )
            return False
