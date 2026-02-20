"""Batch backfill script for hilbert_index.

Iterates over all Memory rows where hilbert_index is NULL, computes the 1D index
from the existing embedding_vector (or search_vector fallback), and updates the row.
Uses batching to avoid massive memory consumption or locking issues.

Usage:
  uv run python -m scripts.backfill_hilbert --batch-size 1000 --max-rows 50000
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AsyncSessionLocal
from app.models import Memory
from app.analyzer.algorithm import compute_hilbert_index

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def backfill(batch_size: int, max_rows: int | None = None, dry_run: bool = False):
    total_processed = 0
    total_updated = 0
    
    logger.info(f"Starting hilbert backfill. Batch size: {batch_size}, Max rows: {max_rows or 'Unlimited'}, Dry run: {dry_run}")
    
    last_id = 0
    while True:
        if max_rows is not None and total_processed >= max_rows:
            logger.info("Reached max_rows limit. Stopping.")
            break
            
        async with AsyncSessionLocal() as session:
            # Find rows
            stmt = select(Memory).where(
                Memory.hilbert_index.is_(None),
                Memory.id > last_id
            ).order_by(Memory.id).limit(batch_size)
            result = await session.execute(stmt)
            memories = result.scalars().all()
            
            if not memories:
                logger.info("No more memories to process. Done.")
                break
                
            batch_updates = []
            
            for mem in memories:
                last_id = max(last_id, mem.id)
                total_processed += 1
                vec = None
                if isinstance(mem.embedding_vector, list) and len(mem.embedding_vector) > 0:
                    vec = mem.embedding_vector
                elif isinstance(mem.search_vector, list) and len(mem.search_vector) > 0:
                    vec = mem.search_vector
                    
                if vec:
                    h_index = compute_hilbert_index(vec)
                    if h_index is not None:
                        batch_updates.append({"id": mem.id, "hilbert_index": h_index})
            
            if batch_updates and not dry_run:
                # Issue bulk update
                await session.execute(update(Memory), batch_updates)
                await session.commit()
                total_updated += len(batch_updates)
                
            logger.info(f"Processed batch of {len(memories)} rows. Updated {len(batch_updates)} valid vectors. Total processed: {total_processed}")
            
    logger.info(f"Backfill complete. Total processed: {total_processed}, Total updated: {total_updated}")


def main():
    parser = argparse.ArgumentParser(description="Backfill Hilbert space-filling curve indexes.")
    parser.add_argument("--batch-size", type=int, default=1000, help="Number of rows per batch (default: 1000)")
    parser.add_argument("--max-rows", type=int, default=None, help="Maximum number of rows to process")
    parser.add_argument("--dry-run", action="store_true", help="Calculate indexes but do not write to DB")
    
    args = parser.parse_args()
    
    try:
        asyncio.run(backfill(batch_size=args.batch_size, max_rows=args.max_rows, dry_run=args.dry_run))
    except KeyboardInterrupt:
        logger.info("Interrupted by user. Exiting.")
        sys.exit(1)


if __name__ == "__main__":
    main()
