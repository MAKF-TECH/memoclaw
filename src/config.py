"""MemoClaw configuration via environment variables."""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # API
    memoclaw_api_key: str = Field(default="mc-changeme")
    port: int = Field(default=8420)

    # LLM
    llm_provider: str = Field(default="openrouter")
    llm_api_key: str = Field(default="")
    llm_base_url: str = Field(default="https://openrouter.ai/api/v1")
    llm_model: str = Field(default="openai/gpt-4o-mini")

    # Embedding
    embedding_provider: str = Field(default="openai")
    embedding_api_key: str = Field(default="")
    embedding_base_url: str = Field(default="https://api.openai.com/v1")
    embedding_model: str = Field(default="text-embedding-3-small")
    embedding_dimensions: int = Field(default=1536)

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://memoclaw:memoclaw@postgres:5432/memoclaw"
    )

    # Workers
    worker_concurrency: int = Field(default=4)
    decay_check_interval: int = Field(default=3600)

    # Logging
    log_level: str = Field(default="info")

    # Web UI Auth
    session_secret: str = Field(default="memoclaw-change-this-secret-key")
    session_max_age: int = Field(default=86400)  # 24 hours
    webui_init_user: str = Field(default="admin")
    webui_init_password: str = Field(default="memoclaw")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
