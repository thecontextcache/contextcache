"""
Rate limiting middleware for FastAPI
"""
import time
from typing import Optional, Dict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from fastapi import status
import redis.asyncio as redis


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple rate limiting middleware using Redis.
    Falls back to in-memory if Redis is not available.
    """

    def __init__(
        self,
        app,
        redis_url: Optional[str] = None,
        requests_per_minute: int = 300,  # ✅ Increased from 60
        requests_per_hour: int = 5000,   # ✅ Increased from 1000
    ):
        super().__init__(app)
        self.redis_url = redis_url
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.redis_client: Optional[redis.Redis] = None
        self.in_memory_cache: Dict[str, list] = {}  # Fallback

    async def dispatch(self, request: Request, call_next):
        """Apply rate limiting to incoming requests"""
        
        # ✅ Skip rate limiting for:
        # 1. Health/docs endpoints
        # 2. OPTIONS requests (CORS preflight)
        # 3. Static files
        if (
            request.url.path in ["/health", "/docs", "/openapi.json", "/redoc"] or
            request.method == "OPTIONS" or
            request.url.path.startswith("/static/")
        ):
            return await call_next(request)

        # Get client identifier (IP address)
        client_ip = request.client.host if request.client else "unknown"
        
        # Check rate limit
        is_allowed, retry_after = await self._check_rate_limit(client_ip)
        
        if not is_allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": retry_after
                },
                headers={"Retry-After": str(retry_after)}
            )

        # Process request
        response = await call_next(request)
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        
        return response

    async def _check_rate_limit(self, client_id: str) -> tuple[bool, int]:
        """
        Check if client has exceeded rate limit.
        Returns (is_allowed, retry_after_seconds)
        """
        current_time = time.time()
        minute_key = f"ratelimit:{client_id}:minute"
        hour_key = f"ratelimit:{client_id}:hour"

        if self.redis_url and not self.redis_client:
            try:
                self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            except Exception as e:
                print(f"⚠️ Redis connection failed, using in-memory rate limiting: {e}")

        if self.redis_client:
            try:
                return await self._check_redis_rate_limit(
                    minute_key, hour_key, current_time
                )
            except Exception as e:
                print(f"⚠️ Redis rate limit check failed: {e}")
                # Fall through to in-memory

        # In-memory fallback
        return self._check_memory_rate_limit(client_id, current_time)

    async def _check_redis_rate_limit(
        self, minute_key: str, hour_key: str, current_time: float
    ) -> tuple[bool, int]:
        """Check rate limit using Redis"""
        pipe = self.redis_client.pipeline()
        
        # Minute window
        pipe.zadd(minute_key, {str(current_time): current_time})
        pipe.zremrangebyscore(minute_key, 0, current_time - 60)
        pipe.zcard(minute_key)
        pipe.expire(minute_key, 60)
        
        # Hour window
        pipe.zadd(hour_key, {str(current_time): current_time})
        pipe.zremrangebyscore(hour_key, 0, current_time - 3600)
        pipe.zcard(hour_key)
        pipe.expire(hour_key, 3600)
        
        results = await pipe.execute()
        minute_count = results[2]
        hour_count = results[6]

        if minute_count > self.requests_per_minute:
            return False, 60
        if hour_count > self.requests_per_hour:
            return False, 3600

        return True, 0

    def _check_memory_rate_limit(
        self, client_id: str, current_time: float
    ) -> tuple[bool, int]:
        """Check rate limit using in-memory cache (fallback)"""
        if client_id not in self.in_memory_cache:
            self.in_memory_cache[client_id] = []

        # Clean old entries
        timestamps = self.in_memory_cache[client_id]
        timestamps = [t for t in timestamps if current_time - t < 3600]
        self.in_memory_cache[client_id] = timestamps

        # Check minute window
        minute_count = sum(1 for t in timestamps if current_time - t < 60)
        if minute_count >= self.requests_per_minute:
            return False, 60

        # Check hour window
        if len(timestamps) >= self.requests_per_hour:
            return False, 3600

        # Add current request
        timestamps.append(current_time)
        
        return True, 0


__all__ = ["RateLimitMiddleware"]