"""
Arq worker settings
"""
import os
from arq.connections import RedisSettings


def get_redis_settings() -> RedisSettings:
    """Get Redis settings from environment"""
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # Use from_dsn for consistent parsing (same as main.py)
    try:
        return RedisSettings.from_dsn(redis_url)
    except Exception as e:
        print(f" Failed to parse REDIS_URL, using defaults: {e}")
        # Fallback to manual configuration
        return RedisSettings(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            password=os.getenv("REDIS_PASSWORD"),
            database=int(os.getenv("REDIS_DB", 0))
        )


class WorkerSettings:
    """Arq worker configuration"""
    
    # Redis settings
    redis_settings = get_redis_settings()
    
    # Worker configuration
    max_jobs = 10
    job_timeout = 300  # 5 minutes
    keep_result = 3600  # Keep results for 1 hour
    
    # Cron jobs (scheduled tasks)
    cron_jobs = [
        # Run decay every hour
        # ('decay_facts', 'cc_core.worker.tasks:decay_facts_task', hour={0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}),
    ]