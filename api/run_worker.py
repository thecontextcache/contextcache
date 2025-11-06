#!/usr/bin/env python3
"""
Arq Worker Entry Point
Run with: python run_worker.py
"""
from arq import run_worker
from cc_core.worker.main import WorkerConfig


if __name__ == "__main__":
    """Run the Arq worker"""
    print(" Starting ContextCache Background Worker...")
    print("   This worker processes background jobs:")
    print("   - Document processing (chunking, embedding)")
    print("   - Ranking computation (PageRank, time decay)")
    print("   - Periodic maintenance tasks")
    print()

    run_worker(WorkerConfig)
