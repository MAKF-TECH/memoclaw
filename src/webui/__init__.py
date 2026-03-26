"""Web UI — serves the MemoClaw dashboard."""

from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, FileResponse

webui_router = APIRouter(tags=["WebUI"])

STATIC_DIR = Path(__file__).parent / "static"


@webui_router.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve the main dashboard page."""
    index = STATIC_DIR / "index.html"
    return HTMLResponse(content=index.read_text(), status_code=200)


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
