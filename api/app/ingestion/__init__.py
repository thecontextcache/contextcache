"""Incremental ingestion scaffolding for CocoIndex + hybrid retrieval.

This package is intentionally lightweight for beta:
- local filesystem ingestion for development
- stable interfaces ready for CocoIndex-managed ETL later
- embeddings written to `memories.embedding_vector` + `memories.search_vector`
"""
from .pipeline import IngestionConfig, ingest_path_incremental
from .cocoindex_flow import cocoindex_ingest_flow

__all__ = [
    "IngestionConfig",
    "cocoindex_ingest_flow",
    "ingest_path_incremental",
]
