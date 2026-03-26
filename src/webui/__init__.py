"""Web UI — serves the MemoClaw dashboard with session-based auth."""

from pathlib import Path

import bcrypt
import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select

from src.db import get_session
from src.models import WebUser
from src.api.auth import create_session_token, verify_session_token
from src.config import settings

logger = structlog.get_logger()

webui_router = APIRouter(tags=["WebUI"])
auth_router = APIRouter(prefix="/auth", tags=["Auth"])

STATIC_DIR = Path(__file__).parent / "static"


# ── Web UI Pages ───────────────────────────────────────────────────


@webui_router.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    """Serve the main dashboard page (requires session)."""
    index = STATIC_DIR / "index.html"
    return HTMLResponse(content=index.read_text(), status_code=200)


@webui_router.get("/login", response_class=HTMLResponse)
async def serve_login(request: Request):
    """Serve the login page."""
    # If already logged in, redirect to dashboard
    session_token = request.cookies.get("memoclaw_session")
    if session_token:
        username = verify_session_token(session_token)
        if username:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url="/", status_code=302)

    login_page = STATIC_DIR / "login.html"
    return HTMLResponse(content=login_page.read_text(), status_code=200)


@webui_router.get("/static/{filename}")
async def serve_static(filename: str):
    """Serve static files (CSS, JS)."""
    filepath = STATIC_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        return HTMLResponse(content="Not found", status_code=404)

    content_types = {
        ".css": "text/css",
        ".js": "application/javascript",
        ".html": "text/html",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
    }
    ct = content_types.get(filepath.suffix, "application/octet-stream")
    return FileResponse(filepath, media_type=ct)


# ── Auth API ───────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@auth_router.post("/login")
async def login(req: LoginRequest):
    """Authenticate user and set session cookie."""
    async with get_session() as session:
        result = await session.execute(
            select(WebUser).where(WebUser.username == req.username, WebUser.is_active == True)
        )
        user = result.scalar_one_or_none()

        if not user or not bcrypt.checkpw(
            req.password.encode("utf-8"),
            user.password_hash.encode("utf-8"),
        ):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = create_session_token(user.username)

        response = JSONResponse(content={"status": "ok", "username": user.username})
        response.set_cookie(
            key="memoclaw_session",
            value=token,
            max_age=settings.session_max_age,
            httponly=True,
            samesite="lax",
            secure=False,  # Set to True if behind HTTPS
            path="/",
        )
        logger.info("user_logged_in", username=user.username)
        return response


@auth_router.post("/logout")
async def logout():
    """Clear session cookie."""
    response = JSONResponse(content={"status": "ok"})
    response.delete_cookie("memoclaw_session", path="/")
    return response


@auth_router.get("/me")
async def get_me(request: Request):
    """Get current authenticated user info."""
    session_token = request.cookies.get("memoclaw_session")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    username = verify_session_token(session_token)
    if not username:
        raise HTTPException(status_code=401, detail="Session expired")

    return {"username": username}


@auth_router.post("/change-password")
async def change_password(request: Request, req: ChangePasswordRequest):
    """Change password for the current user."""
    session_token = request.cookies.get("memoclaw_session")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    username = verify_session_token(session_token)
    if not username:
        raise HTTPException(status_code=401, detail="Session expired")

    async with get_session() as session:
        result = await session.execute(
            select(WebUser).where(WebUser.username == username)
        )
        user = result.scalar_one_or_none()

        if not user or not bcrypt.checkpw(
            req.current_password.encode("utf-8"),
            user.password_hash.encode("utf-8"),
        ):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

        user.password_hash = bcrypt.hashpw(
            req.new_password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")
        logger.info("password_changed", username=username)

    return {"status": "ok"}
