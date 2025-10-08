"""
Run Arq worker
"""
from arq import run_worker
from cc_core.worker.main import WorkerConfig


if __name__ == "__main__":
    run_worker(WorkerConfig)