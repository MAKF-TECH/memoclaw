"""Authentication middleware."""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from src.config import settings


class AuthMiddleware(BaseHTTPMiddleware):
    """Bearer token authentication middleware."""

    EXEMPT_PATHS = {"/health", "/health/ready", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

        token = auth_header[7:]  # Strip "Bearer "
        if token != settings.memoclaw_api_key:
            raise HTTPException(status_code=401, detail="Invalid API key")

        return await call_next(request)
