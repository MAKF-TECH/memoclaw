"""Web UI — serves the React build + auth endpoints."""

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

# React build output
DIST_DIR = Path(__file__).parent / "dist"
# Fallback to old static dir
STATIC_DIR = Path(__file__).parent / "static"


def _get_dist():
    """Return dist dir if React build exists, else fallback."""
    if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
        return DIST_DIR
    return STATIC_DIR


# ── Web UI Pages ───────────────────────────────────────────────────

@webui_router.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    """Serve main dashboard (React SPA)."""
    dist = _get_dist()
    index = dist / "index.html"
    if not index.exists():
        return HTMLResponse("<h1>MemoClaw</h1><p>UI not built. Run npm run build in webui/</p>", 200)
    return HTMLResponse(content=index.read_text(), status_code=200)


@webui_router.get("/login.html", response_class=HTMLResponse)
@webui_router.get("/login", response_class=HTMLResponse)
async def serve_login(request: Request):
    """Serve login page."""
    session_token = request.cookies.get("memoclaw_session")
    if session_token and verify_session_token(session_token):
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/", status_code=302)

    login_page = STATIC_DIR / "login.html"
    if login_page.exists():
        return HTMLResponse(content=login_page.read_text(), status_code=200)
    return HTMLResponse("<h1>Login</h1><p>Login page not found</p>", 404)


@webui_router.get("/assets/{path:path}")
async def serve_assets(path: str):
    """Serve Vite build assets."""
    dist = _get_dist()
    filepath = dist / "assets" / path
    if not filepath.exists() or not filepath.is_file():
        return HTMLResponse("Not found", 404)
    ct_map = {".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml",
              ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff"}
    return FileResponse(filepath, media_type=ct_map.get(filepath.suffix, "application/octet-stream"))


@webui_router.get("/static/{filename}")
async def serve_static(filename: str):
    """Serve static files (login page CSS/JS, legacy)."""
    filepath = STATIC_DIR / filename
    if not filepath.exists() or not filepath.is_file():
        return HTMLResponse("Not found", 404)
    ct_map = {".css": "text/css", ".js": "application/javascript", ".html": "text/html",
              ".svg": "image/svg+xml", ".png": "image/png"}
    return FileResponse(filepath, media_type=ct_map.get(filepath.suffix, "application/octet-stream"))


# ── Auth API ───────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@auth_router.post("/login")
async def login(req: LoginRequest):
    async with get_session() as session:
        result = await session.execute(
            select(WebUser).where(WebUser.username == req.username, WebUser.is_active == True))
        user = result.scalar_one_or_none()
        if not user or not bcrypt.checkpw(req.password.encode(), user.password_hash.encode()):
            raise HTTPException(401, "Invalid username or password")

        token = create_session_token(user.username)
        response = JSONResponse(content={"status": "ok", "username": user.username})
        response.set_cookie(key="memoclaw_session", value=token, max_age=settings.session_max_age,
                            httponly=True, samesite="lax", secure=False, path="/")
        logger.info("user_logged_in", username=user.username)
        return response


@auth_router.post("/logout")
async def logout():
    response = JSONResponse(content={"status": "ok"})
    response.delete_cookie("memoclaw_session", path="/")
    return response


@auth_router.get("/me")
async def get_me(request: Request):
    session_token = request.cookies.get("memoclaw_session")
    if not session_token:
        raise HTTPException(401, "Not authenticated")
    username = verify_session_token(session_token)
    if not username:
        raise HTTPException(401, "Session expired")
    return {"username": username}


@auth_router.post("/change-password")
async def change_password(request: Request, req: ChangePasswordRequest):
    session_token = request.cookies.get("memoclaw_session")
    if not session_token:
        raise HTTPException(401, "Not authenticated")
    username = verify_session_token(session_token)
    if not username:
        raise HTTPException(401, "Session expired")

    async with get_session() as session:
        result = await session.execute(select(WebUser).where(WebUser.username == username))
        user = result.scalar_one_or_none()
        if not user or not bcrypt.checkpw(req.current_password.encode(), user.password_hash.encode()):
            raise HTTPException(401, "Current password is incorrect")
        user.password_hash = bcrypt.hashpw(req.new_password.encode(), bcrypt.gensalt()).decode()
        logger.info("password_changed", username=username)
    return {"status": "ok"}
