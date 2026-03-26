"""MemoClaw — Self-hosted memory engine for AI agents."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.db import init_db, close_db
from src.llm import llm_client, embedding_client
from src.api.auth import AuthMiddleware
from src.api.routes import (
    documents_router,
    memories_router,
    search_router,
    profile_router,
    health_router,
)
from src.webui import webui_router
from src.workers import decay_worker

# Configure structlog
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        structlog.get_config()["wrapper_class"].level
        if hasattr(structlog.get_config().get("wrapper_class", object), "level")
        else 0
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

_decay_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    global _decay_task

    logger.info(
        "memoclaw_starting",
        port=settings.port,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        embedding_provider=settings.embedding_provider,
        embedding_model=settings.embedding_model,
    )

    # Initialize database
    await init_db()
    logger.info("database_initialized")

    # Start decay worker
    _decay_task = asyncio.create_task(decay_worker())

    yield

    # Shutdown
    if _decay_task:
        _decay_task.cancel()
        try:
            await _decay_task
        except asyncio.CancelledError:
            pass

    await llm_client.close()
    await embedding_client.close()
    await close_db()
    logger.info("memoclaw_shutdown")


# Create FastAPI app
app = FastAPI(
    title="MemoClaw",
    description="Self-hosted memory engine for AI agents — supermemory.ai compatible",
    version="0.1.0",
    lifespan=lifespan,
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthMiddleware)

# Routers
app.include_router(health_router)
app.include_router(documents_router)
app.include_router(memories_router)
app.include_router(search_router)
app.include_router(profile_router)
app.include_router(webui_router)
