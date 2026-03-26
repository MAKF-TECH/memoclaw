"""Background worker for periodic memory decay checks."""

from __future__ import annotations

import asyncio
import structlog

from src.config import settings
from src.db import get_session
from src.core import memory_engine

logger = structlog.get_logger()


async def decay_worker():
    """Periodically check and forget expired memories."""
    logger.info("decay_worker_started", interval=settings.decay_check_interval)
    while True:
        try:
            await asyncio.sleep(settings.decay_check_interval)
            async with get_session() as session:
                count = await memory_engine.run_decay_check(session)
                if count:
                    logger.info("decay_worker_cycle", forgotten=count)
        except asyncio.CancelledError:
            logger.info("decay_worker_stopped")
            break
        except Exception as e:
            logger.error("decay_worker_error", error=str(e))
            await asyncio.sleep(60)  # Back off on error
