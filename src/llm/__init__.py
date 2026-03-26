"""LLM provider abstraction — supports OpenRouter, OpenAI, Ollama, and custom endpoints."""

from __future__ import annotations

import json
import structlog
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from src.config import settings

logger = structlog.get_logger()


class LLMClient:
    """Unified LLM client using OpenAI-compatible chat completions API."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ):
        self.base_url = (base_url or settings.llm_base_url).rstrip("/")
        self.api_key = api_key or settings.llm_api_key
        self.model = model or settings.llm_model
        self._client = httpx.AsyncClient(timeout=120.0)

    async def close(self):
        await self._client.aclose()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.ConnectError)),
    )
    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
        response_format: dict | None = None,
    ) -> str:
        """Send a chat completion request and return the assistant's reply."""
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        # OpenRouter-specific headers
        if settings.llm_provider == "openrouter":
            headers["HTTP-Referer"] = "https://memoclaw.local"
            headers["X-Title"] = "MemoClaw"

        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            payload["response_format"] = response_format

        url = f"{self.base_url}/chat/completions"
        logger.debug("llm_request", url=url, model=self.model, msg_count=len(messages))

        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        content = data["choices"][0]["message"]["content"]
        logger.debug("llm_response", chars=len(content))
        return content

    async def chat_json(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> dict:
        """Chat completion that returns parsed JSON."""
        raw = await self.chat(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        # Strip markdown code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # Remove first and last lines (fences)
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines)
        return json.loads(cleaned)


class EmbeddingClient:
    """Embedding client using OpenAI-compatible embeddings API."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ):
        self.base_url = (base_url or settings.embedding_base_url).rstrip("/")
        self.api_key = api_key or settings.embedding_api_key
        self.model = model or settings.embedding_model
        self._client = httpx.AsyncClient(timeout=60.0)

    async def close(self):
        await self._client.aclose()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.ConnectError)),
    )
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload: dict = {
            "model": self.model,
            "input": texts,
        }
        if settings.embedding_dimensions and settings.embedding_provider != "ollama":
            payload["dimensions"] = settings.embedding_dimensions

        url = f"{self.base_url}/embeddings"
        logger.debug("embedding_request", url=url, model=self.model, count=len(texts))

        resp = await self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        embeddings = [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]
        logger.debug("embedding_response", count=len(embeddings), dims=len(embeddings[0]) if embeddings else 0)
        return embeddings

    async def embed_one(self, text: str) -> list[float]:
        """Embed a single text."""
        results = await self.embed([text])
        return results[0]


# Singleton instances
llm_client = LLMClient()
embedding_client = EmbeddingClient()
