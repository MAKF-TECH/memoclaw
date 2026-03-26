"""Database connection and session management."""

from contextlib import asynccontextmanager

import bcrypt
import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text, select

from src.config import settings
from src.models import Base, WebUser

logger = structlog.get_logger()

engine = create_async_engine(
    settings.database_url,
    echo=settings.log_level == "debug",
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Create tables and install pgvector extension."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.create_all)

    # Seed default admin user if none exist
    await _seed_admin_user()


async def _seed_admin_user():
    """Create the initial admin user if no web users exist."""
    async with async_session() as session:
        result = await session.execute(select(WebUser).limit(1))
        existing = result.scalar_one_or_none()
        if existing:
            return  # Users already exist, skip

        username = settings.webui_init_user
        password = settings.webui_init_password
        pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        user = WebUser(username=username, password_hash=pw_hash)
        session.add(user)
        await session.commit()
        logger.info("admin_user_created", username=username)


async def close_db():
    """Dispose engine connections."""
    await engine.dispose()


@asynccontextmanager
async def get_session():
    """Yield an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
