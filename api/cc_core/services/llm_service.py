"""
LLM Service for Answer Generation
Supports: OpenAI, Anthropic (Claude), Databricks, Ollama
"""

import os
import httpx
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class LLMConfig:
    provider: str  # 'openai', 'anthropic', 'databricks', 'ollama', 'smart'
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    max_tokens: int = 500
    temperature: float = 0.7


class LLMService:
    """Generate human-readable answers from retrieved context"""
    
    def __init__(self, config: Optional[LLMConfig] = None):
        self.config = config or LLMConfig(
            provider='smart',
            model='thecontextcache-smart',
        )
    
    async def generate_answer(
        self,
        query: str,
        context_chunks: List[Dict],
        max_tokens: Optional[int] = None
    ) -> Dict:
        """
        Generate a human-readable answer from context chunks
        
        Args:
            query: User's question
            context_chunks: List of relevant text chunks with metadata
            max_tokens: Override default max_tokens
        
        Returns:
            Dict with 'answer', 'sources', 'model_used'
        """
        if self.config.provider == 'smart':
            return await self._generate_smart_answer(query, context_chunks)
        elif self.config.provider == 'openai':
            return await self._generate_openai_answer(query, context_chunks, max_tokens)
        elif self.config.provider == 'anthropic':
            return await self._generate_anthropic_answer(query, context_chunks, max_tokens)
        elif self.config.provider == 'databricks':
            return await self._generate_databricks_answer(query, context_chunks, max_tokens)
        elif self.config.provider == 'ollama':
            return await self._generate_ollama_answer(query, context_chunks, max_tokens)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.config.provider}")
    
    async def _generate_smart_answer(
        self,
        query: str,
        context_chunks: List[Dict]
    ) -> Dict:
        """
        thecontextcache Smart mode: Extract and summarize without external LLM
        Simple extraction + formatting (no API cost, fast, privacy-first)
        """
        if not context_chunks:
            return {
                'answer': "I couldn't find relevant information in your documents to answer this question.",
                'sources': [],
                'model_used': 'thecontextcache-smart',
                'method': 'extractive'
            }
        
        # Take top 3 most relevant chunks
        top_chunks = sorted(
            context_chunks,
            key=lambda x: x.get('similarity', 0) or x.get('score', 0),
            reverse=True
        )[:3]
        
        # Build extractive answer
        answer_parts = []
        sources = []
        
        for idx, chunk in enumerate(top_chunks, 1):
            text = chunk.get('text', '')
            source = chunk.get('source_url', 'Unknown')
            similarity = chunk.get('similarity', chunk.get('score', 0))
            
            # Format as numbered excerpt
            answer_parts.append(f"[{idx}] {text}")
            
            sources.append({
                'index': idx,
                'source': source,
                'relevance': float(similarity),
                'chunk_id': chunk.get('chunk_id', '')
            })
        
        # Combine into final answer
        answer = (
            f"Based on your documents, here's what I found:\n\n"
            + "\n\n".join(answer_parts)
        )
        
        return {
            'answer': answer,
            'sources': sources,
            'model_used': 'thecontextcache-smart',
            'method': 'extractive'
        }
    
    async def _generate_openai_answer(
        self,
        query: str,
        context_chunks: List[Dict],
        max_tokens: Optional[int] = None
    ) -> Dict:
        """Generate answer using OpenAI GPT-4"""
        if not self.config.api_key:
            raise ValueError("OpenAI API key not configured")
        
        # Build context
        context = "\n\n".join([
            f"[Source {i+1}]: {chunk.get('text', '')}"
            for i, chunk in enumerate(context_chunks[:5])
        ])
        
        prompt = f"""You are a helpful AI assistant. Answer the user's question based ONLY on the provided context. If the context doesn't contain enough information, say so.

Context:
{context}

Question: {query}

Answer:"""
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.config.model or "gpt-4",
                    "messages": [
                        {"role": "system", "content": "You are a helpful assistant that answers questions based on provided context."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": max_tokens or self.config.max_tokens,
                    "temperature": self.config.temperature,
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            
            answer = data['choices'][0]['message']['content']
            
            return {
                'answer': answer,
                'sources': [{'source': c.get('source_url'), 'chunk_id': c.get('chunk_id')} for c in context_chunks],
                'model_used': self.config.model or 'gpt-4',
                'method': 'generative'
            }
    
    async def _generate_anthropic_answer(
        self,
        query: str,
        context_chunks: List[Dict],
        max_tokens: Optional[int] = None
    ) -> Dict:
        """Generate answer using Anthropic Claude"""
        if not self.config.api_key:
            raise ValueError("Anthropic API key not configured")
        
        context = "\n\n".join([
            f"[Source {i+1}]: {chunk.get('text', '')}"
            for i, chunk in enumerate(context_chunks[:5])
        ])
        
        prompt = f"""Answer the user's question based ONLY on the provided context.

Context:
{context}

Question: {query}"""
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.config.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.config.model or "claude-3-sonnet-20240229",
                    "max_tokens": max_tokens or self.config.max_tokens,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            
            answer = data['content'][0]['text']
            
            return {
                'answer': answer,
                'sources': [{'source': c.get('source_url'), 'chunk_id': c.get('chunk_id')} for c in context_chunks],
                'model_used': self.config.model or 'claude-3-sonnet',
                'method': 'generative'
            }
    
    async def _generate_databricks_answer(
        self,
        query: str,
        context_chunks: List[Dict],
        max_tokens: Optional[int] = None
    ) -> Dict:
        """Generate answer using Databricks Foundation Model API"""
        if not self.config.api_key:
            raise ValueError("Databricks API key not configured")
        
        if not self.config.base_url:
            raise ValueError("Databricks base URL not configured")
        
        context = "\n\n".join([
            f"[Source {i+1}]: {chunk.get('text', '')}"
            for i, chunk in enumerate(context_chunks[:5])
        ])
        
        prompt = f"""Answer the question based on the context provided.

Context:
{context}

Question: {query}

Answer:"""
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.config.base_url}/serving-endpoints/{self.config.model}/invocations",
                headers={
                    "Authorization": f"Bearer {self.config.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "inputs": {
                        "prompt": [prompt],
                    },
                    "params": {
                        "max_tokens": max_tokens or self.config.max_tokens,
                        "temperature": self.config.temperature,
                    }
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            
            # Databricks response format varies by model
            answer = data.get('predictions', [{}])[0].get('candidates', [{}])[0].get('text', '')
            
            return {
                'answer': answer,
                'sources': [{'source': c.get('source_url'), 'chunk_id': c.get('chunk_id')} for c in context_chunks],
                'model_used': self.config.model,
                'method': 'generative'
            }
    
    async def _generate_ollama_answer(
        self,
        query: str,
        context_chunks: List[Dict],
        max_tokens: Optional[int] = None
    ) -> Dict:
        """Generate answer using Ollama (local)"""
        base_url = self.config.base_url or "http://localhost:11434"
        
        context = "\n\n".join([
            f"[Source {i+1}]: {chunk.get('text', '')}"
            for i, chunk in enumerate(context_chunks[:5])
        ])
        
        prompt = f"""Answer the question based on the context.

Context:
{context}

Question: {query}

Answer:"""
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/api/generate",
                json={
                    "model": self.config.model or "llama2",
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "num_predict": max_tokens or self.config.max_tokens,
                        "temperature": self.config.temperature,
                    }
                },
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
            
            answer = data.get('response', '')
            
            return {
                'answer': answer,
                'sources': [{'source': c.get('source_url'), 'chunk_id': c.get('chunk_id')} for c in context_chunks],
                'model_used': self.config.model or 'llama2',
                'method': 'generative'
            }

