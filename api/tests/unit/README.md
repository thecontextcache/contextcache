# Unit Tests

This directory contains unit tests for the ContextCache API.

## Test Files

- **test_projects.py** - Tests for project CRUD operations
- **test_documents.py** - Tests for document upload and processing
- **test_crypto.py** - Tests for encryption, signing, and hashing

## Running Tests

### Prerequisites

1. Install test dependencies:
```bash
pip install -r requirements-dev.txt
```

2. Set up a test database:
```bash
# Create test database
createdb contextcache_test

# Or use Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=contextcache_test postgres:15
```

3. Set environment variable (optional):
```bash
export TEST_DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/contextcache_test"
```

### Run All Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=cc_core --cov-report=html

# Run specific test file
pytest tests/unit/test_projects.py

# Run specific test
pytest tests/unit/test_projects.py::test_create_project

# Run with verbose output
pytest -v
```

### Test Coverage

After running with coverage, view the report:
```bash
open htmlcov/index.html
```

## Test Structure

Tests use pytest with async support:

- **Fixtures** - Database sessions and test data are created via fixtures
- **Isolation** - Each test runs in a separate database transaction that is rolled back
- **Async** - All database tests use `@pytest.mark.asyncio`

## Writing New Tests

Example test structure:

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

@pytest.mark.asyncio
async def test_example(db_session: AsyncSession):
    """Test description"""
    # Arrange
    # ... setup test data
    
    # Act
    # ... perform operation
    
    # Assert
    # ... verify results
    assert result == expected
```

## Notes

- Tests automatically create and drop tables for each test
- Crypto tests don't require a database connection
- Document processing tests may take longer due to embedding generation
