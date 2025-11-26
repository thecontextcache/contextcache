"""
Storage layer for ContextCache

Provides database adapters with support for:
- Encrypted storage (XChaCha20-Poly1305)
- Knowledge graph operations (entities, relations, facts)
- KRL embeddings and scores
- Audit chain
- Vector similarity search
"""

from cc_core.storage.adapters.base import StorageAdapter
from cc_core.storage.adapters.postgres import (
    PostgresAdapter,
    serialize_embedding,
    deserialize_embedding,
)

__all__ = [
    "StorageAdapter",
    "PostgresAdapter",
    "serialize_embedding",
    "deserialize_embedding",
]