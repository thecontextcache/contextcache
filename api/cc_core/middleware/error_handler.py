"""
Secure error handling middleware
Prevents information leakage by sanitizing error responses
"""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from structlog import get_logger
import traceback
from typing import Union

logger = get_logger(__name__)


class SecureErrorHandler:
    """
    Centralized error handler that:
    1. Logs full error details internally
    2. Returns sanitized, safe responses to clients
    3. Prevents information leakage
    """
    
    @staticmethod
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        """Handle HTTP exceptions (4xx, 5xx)"""
        # Log the full error internally
        logger.error(
            "http_exception",
            status_code=exc.status_code,
            detail=str(exc.detail),
            path=request.url.path,
            method=request.method,
        )
        
        # Return safe response to client
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.status_code,
                    "message": exc.detail if exc.status_code < 500 else "Internal server error",
                    "type": "http_error"
                }
            }
        )
    
    @staticmethod
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Handle request validation errors (422)"""
        # Log validation errors
        logger.warning(
            "validation_error",
            errors=exc.errors(),
            path=request.url.path,
            method=request.method,
        )
        
        # Return sanitized validation errors
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": 422,
                    "message": "Invalid request data",
                    "type": "validation_error",
                    "details": [
                        {
                            "field": ".".join(str(loc) for loc in err["loc"]),
                            "message": err["msg"],
                            "type": err["type"]
                        }
                        for err in exc.errors()
                    ]
                }
            }
        )
    
    @staticmethod
    async def handle_database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        """Handle database errors - NEVER expose SQL details"""
        # Log full database error internally
        logger.error(
            "database_error",
            error_type=type(exc).__name__,
            error_message=str(exc),
            path=request.url.path,
            method=request.method,
            traceback=traceback.format_exc(),
        )
        
        # Determine if it's a constraint violation
        if isinstance(exc, IntegrityError):
            safe_message = "Data integrity constraint violated"
        else:
            safe_message = "Database operation failed"
        
        # Return generic error - NEVER expose SQL details
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": 500,
                    "message": safe_message,
                    "type": "database_error"
                }
            }
        )
    
    @staticmethod
    async def handle_generic_exception(request: Request, exc: Exception) -> JSONResponse:
        """Handle any unexpected exceptions"""
        # Log full error with stack trace internally
        logger.error(
            "unexpected_error",
            error_type=type(exc).__name__,
            error_message=str(exc),
            path=request.url.path,
            method=request.method,
            traceback=traceback.format_exc(),
        )
        
        # Return generic error - NEVER expose internal details
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": 500,
                    "message": "An unexpected error occurred. Please try again later.",
                    "type": "internal_error"
                }
            }
        )


def register_error_handlers(app):
    """Register all error handlers with the FastAPI app"""
    handler = SecureErrorHandler()
    
    # HTTP exceptions
    app.add_exception_handler(StarletteHTTPException, handler.handle_http_exception)
    
    # Validation errors
    app.add_exception_handler(RequestValidationError, handler.handle_validation_error)
    
    # Database errors
    app.add_exception_handler(SQLAlchemyError, handler.handle_database_error)
    
    # Catch-all for unexpected errors
    app.add_exception_handler(Exception, handler.handle_generic_exception)

