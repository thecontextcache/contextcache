"""
Storage adapters for ContextCache
"""
from cc_core.storage.adapters.base import StorageAdapter
from cc_core.storage.adapters.postgres import PostgresAdapter

__all__ = [
    "StorageAdapter",
    "PostgresAdapter",
]