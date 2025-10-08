"""
API contract testing with Schemathesis
Validates API against OpenAPI schema
"""
import schemathesis
from hypothesis import settings


# Load API schema (FastAPI auto-generates this)
schema = schemathesis.from_uri("http://localhost:8000/openapi.json")


@schema.parametrize()
@settings(max_examples=50)  # Run 50 test cases per endpoint
def test_api_contract(case):
    """
    Test all API endpoints against OpenAPI schema
    
    Checks:
    - Response status codes are valid
    - Response schemas match specification
    - No 500 errors for valid inputs
    """
    response = case.call()
    case.validate_response(response)


@schema.parametrize(endpoint="/health")
def test_health_endpoint(case):
    """Specific test for health endpoint"""
    response = case.call()
    
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "healthy"


@schema.parametrize(endpoint="/projects", method="POST")
@settings(max_examples=10)
def test_project_creation(case):
    """Test project creation with various inputs"""
    response = case.call()
    
    # Should either succeed (200) or fail validation (422)
    assert response.status_code in [200, 422]
    
    if response.status_code == 200:
        data = response.json()
        assert "id" in data
        assert "name" in data
        assert "salt" in data