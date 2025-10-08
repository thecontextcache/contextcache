"""
Arq worker main entry point
"""
from arq import create_pool
from arq.connections import RedisSettings
from cc_core.worker.settings import WorkerSettings
from cc_core.worker.tasks import (
    compute_ranking_task,
    decay_facts_task,
    cleanup_old_data_task,
    startup,
    shutdown
)


# Worker class configuration
class WorkerConfig:
    """Arq worker configuration"""
    
    functions = [
        compute_ranking_task,
        decay_facts_task,
        cleanup_old_data_task,
    ]
    
    redis_settings = WorkerSettings.redis_settings
    max_jobs = WorkerSettings.max_jobs
    job_timeout = WorkerSettings.job_timeout
    keep_result = WorkerSettings.keep_result
    
    on_startup = startup
    on_shutdown = shutdown