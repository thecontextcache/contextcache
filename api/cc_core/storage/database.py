"""
Database connection and session management
"""
import os
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv

# Load environment variables FIRST
load_dotenv(".env.local")

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Convert postgres:// to postgresql+asyncpg:// and handle SSL
if DATABASE_URL:
    # Replace scheme
    if DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    # Remove sslmode query parameter (asyncpg handles SSL differently)
    if "?sslmode=" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.split("?sslmode=")[0]
    if "&sslmode=" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.split("&sslmode=")[0]

# Create async engine with SSL support
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args={
        "ssl": "require",  # asyncpg uses 'ssl' instead of 'sslmode'
        "server_settings": {
            "jit": "off"  # Disable JIT for better compatibility
        }
    }
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting async database sessions
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """
    Initialize database (create tables if needed)
    """
    async with engine.begin() as conn:
        # Tables already created via schema.sql
        # This is just for connection testing
        await conn.run_sync(lambda _: None)