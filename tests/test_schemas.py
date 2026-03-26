"""Basic tests for MemoClaw API schemas and config."""

from src.config import Settings
from src.api.schemas import (
    AddDocumentRequest,
    SearchMemoriesRequest,
    ProfileRequest,
    CreateMemoryRequest,
)


def test_settings_defaults():
    s = Settings(
        memoclaw_api_key="test",
        llm_api_key="test",
        embedding_api_key="test",
    )
    assert s.port == 8420
    assert s.llm_provider == "openrouter"
    assert s.embedding_dimensions == 1536


def test_add_document_schema():
    req = AddDocumentRequest(content="Hello world", containerTag="user_123")
    assert req.content == "Hello world"
    assert req.containerTag == "user_123"


def test_search_schema_defaults():
    req = SearchMemoriesRequest(q="test query")
    assert req.limit == 10
    assert req.threshold == 0.0
    assert req.searchMode == "hybrid"


def test_profile_schema():
    req = ProfileRequest(containerTag="user_123", q="what do they like?")
    assert req.containerTag == "user_123"


def test_memory_type_validation():
    req = CreateMemoryRequest(content="test", type="fact")
    assert req.type == "fact"

    req = CreateMemoryRequest(content="test", type="preference")
    assert req.type == "preference"

    req = CreateMemoryRequest(content="test", type="episode")
    assert req.type == "episode"
