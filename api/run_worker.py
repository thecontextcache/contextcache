"""
Worker startup script
"""
import asyncio
import os
from arq import run_worker
from cc_core.worker.main import WorkerConfig


if __name__ == "__main__":
    print("🚀 Starting ARQ worker...")
    
    # Validate environment
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        print("⚠️ Warning: REDIS_URL not set, using default redis://localhost:6379")
    else:
        print(f"✅ Redis URL: {redis_url.split('@')[-1] if '@' in redis_url else redis_url}")
    
    # Check database connection
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ Error: DATABASE_URL not set")
        exit(1)
    
    print("✅ Database URL configured")
    print("\nRegistered tasks:")
    for func in WorkerConfig.functions:
        print(f"  - {func.__name__}")
    
    print("\n🔄 Worker is ready to process jobs...\n")
    
    # Run worker
    asyncio.run(run_worker(WorkerConfig))