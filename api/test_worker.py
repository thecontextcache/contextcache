"""
Test worker tasks (without Redis)
"""
import asyncio
from cc_core.worker.tasks import compute_ranking_task, decay_facts_task


async def main():
    print(" Testing worker tasks...\n")
    
    # Test ranking task
    print("1⃣ Testing ranking computation...")
    result = await compute_ranking_task(
        {},
        project_id="8e5691d5-b394-45e4-9716-8f1d99bc8595"
    )
    print(f" Result: {result}\n")
    
    # Test decay task
    print("2⃣ Testing decay task...")
    result = await decay_facts_task({})
    print(f" Result: {result}\n")
    
    print(" Worker tasks tested successfully!")


if __name__ == "__main__":
    asyncio.run(main())