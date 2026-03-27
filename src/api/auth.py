"""Authentication middleware — API bearer tokens + web session cookies."""

from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from src.config import settings

# Session signer
_signer = URLSafeTimedSerializer(settings.session_secret)

# Paths that never require auth
PUBLIC_PATHS = {"/health", "/health/ready", "/docs", "/openapi.json", "/redoc"}

# Web UI paths that need session auth (not bearer)
WEBUI_PATHS = {"/", "/login"}
WEBUI_PREFIXES = ("/static/", "/assets/")

# Auth API paths (login/logout endpoints)
AUTH_API_PATHS = {"/auth/login", "/auth/logout", "/auth/me"}


def create_session_token(username: str) -> str:
    """Create a signed session token."""
    return _signer.dumps({"u": username})


def verify_session_token(token: str) -> str | None:
    """Verify a session token. Returns username or None."""
    try:
        data = _signer.loads(token, max_age=settings.session_max_age)
        return data.get("u")
    except (BadSignature, SignatureExpired):
        return None


class AuthMiddleware(BaseHTTPMiddleware):
    """Combined auth: bearer tokens for API, session cookies for web UI."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Public paths — no auth needed
        if path in PUBLIC_PATHS:
            return await call_next(request)

        # Static files — no auth needed
        for prefix in WEBUI_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)

        # Auth API endpoints — no auth needed (they handle it themselves)
        if path in AUTH_API_PATHS:
            return await call_next(request)

        # Login page — no auth needed
        if path in ("/login", "/login.html"):
            return await call_next(request)

        # Web UI root — check session cookie, redirect to login if missing
        if path == "/":
            session_token = request.cookies.get("memoclaw_session")
            if session_token:
                username = verify_session_token(session_token)
                if username:
                    request.state.web_user = username
                    return await call_next(request)
            return RedirectResponse(url="/login", status_code=302)

        # API paths (anything under /v1/) — check bearer token
        if path.startswith("/v1/"):
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                if token == settings.memoclaw_api_key:
                    return await call_next(request)

            # Also accept session cookie for API calls from the web UI
            session_token = request.cookies.get("memoclaw_session")
            if session_token:
                username = verify_session_token(session_token)
                if username:
                    request.state.web_user = username
                    return await call_next(request)

            raise HTTPException(status_code=401, detail="Unauthorized")

        # Default: require some form of auth
        raise HTTPException(status_code=401, detail="Unauthorized")
