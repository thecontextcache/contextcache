#!/usr/bin/env python3
"""Wrapper for app.seed_mock_data.

Runs the same SQLAlchemy seeding logic as:
  python -m app.seed_mock_data
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.seed_mock_data import seed_mock_data


if __name__ == "__main__":
    asyncio.run(seed_mock_data())
