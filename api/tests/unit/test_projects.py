"""
Test project CRUD operations
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from cc_core.storage.database import Base
from cc_core.models.project import ProjectDB
import os


# Test database URL
TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL", 
    "postgresql+asyncpg://postgres:postgres@localhost:5432/contextcache_test"
)


@pytest.fixture(scope="function")
async def db_session():
    """Create a test database session"""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with async_session() as session:
        yield session
        await session.rollback()
    
    # Drop tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.mark.asyncio
async def test_create_project(db_session: AsyncSession):
    """Test creating a project"""
    project = ProjectDB(
        name="Test Project",
        salt=b"test_salt_16byte"
    )
    
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    
    assert project.id is not None
    assert project.name == "Test Project"
    assert project.salt == b"test_salt_16byte"
    assert project.created_at is not None
    assert project.updated_at is not None


@pytest.mark.asyncio
async def test_read_project(db_session: AsyncSession):
    """Test reading a project"""
    # Create
    project = ProjectDB(name="Read Test", salt=b"salt123456789012")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    
    project_id = project.id
    
    # Read
    result = await db_session.execute(
        text("SELECT * FROM projects WHERE id = :id"),
        {"id": str(project_id)}
    )
    row = result.first()
    
    assert row is not None
    assert row.name == "Read Test"


@pytest.mark.asyncio
async def test_update_project(db_session: AsyncSession):
    """Test updating a project"""
    # Create
    project = ProjectDB(name="Original Name", salt=b"salt123456789012")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    
    # Update
    project.name = "Updated Name"
    await db_session.commit()
    await db_session.refresh(project)
    
    assert project.name == "Updated Name"


@pytest.mark.asyncio
async def test_delete_project(db_session: AsyncSession):
    """Test deleting a project"""
    # Create
    project = ProjectDB(name="Delete Me", salt=b"salt123456789012")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    
    project_id = project.id
    
    # Delete
    await db_session.delete(project)
    await db_session.commit()
    
    # Verify deletion
    result = await db_session.execute(
        text("SELECT * FROM projects WHERE id = :id"),
        {"id": str(project_id)}
    )
    row = result.first()
    
    assert row is None


@pytest.mark.asyncio
async def test_list_projects(db_session: AsyncSession):
    """Test listing multiple projects"""
    # Create multiple projects
    projects = [
        ProjectDB(name=f"Project {i}", salt=f"salt{i:016d}".encode())
        for i in range(5)
    ]
    
    for project in projects:
        db_session.add(project)
    
    await db_session.commit()
    
    # List all
    result = await db_session.execute(text("SELECT COUNT(*) FROM projects"))
    count = result.scalar()
    
    assert count == 5


@pytest.mark.asyncio
async def test_project_name_validation():
    """Test project name validation"""
    # Valid names
    valid_names = [
        "Simple Project",
        "Project-123",
        "A" * 200,  # Max length
    ]
    
    for name in valid_names:
        project = ProjectDB(name=name, salt=b"salt123456789012")
        assert project.name == name
    
    # Invalid names (empty)
    with pytest.raises(Exception):
        project = ProjectDB(name="", salt=b"salt123456789012")


@pytest.mark.asyncio
async def test_project_salt_required():
    """Test that salt is required"""
    with pytest.raises(Exception):
        project = ProjectDB(name="No Salt Project")
        # This should fail because salt is required


@pytest.mark.asyncio
async def test_project_timestamps(db_session: AsyncSession):
    """Test that timestamps are set correctly"""
    project = ProjectDB(name="Timestamp Test", salt=b"salt123456789012")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    
    assert project.created_at is not None
    assert project.updated_at is not None
    assert project.created_at == project.updated_at
