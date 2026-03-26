"""Pydantic schemas — supermemory-compatible API models."""

from __future__ import annotations
from typing import Optional, Any
from pydantic import BaseModel, Field


# ── Documents ──────────────────────────────────────────────────────

class AddDocumentRequest(BaseModel):
    content: str = Field(..., description="Text, URL, or conversation content")
    containerTag: Optional[str] = Field(None, max_length=100)
    customId: Optional[str] = Field(None, max_length=100)
    metadata: Optional[dict[str, Any]] = None
    entityContext: Optional[str] = Field(None, max_length=1500)


class BatchDocumentItem(BaseModel):
    content: str
    containerTag: Optional[str] = None
    customId: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class BatchAddDocumentsRequest(BaseModel):
    documents: list[BatchDocumentItem] = Field(..., min_length=1, max_length=600)
    containerTag: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class UpdateDocumentRequest(BaseModel):
    content: Optional[str] = None
    containerTag: Optional[str] = None
    customId: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class DocumentResponse(BaseModel):
    id: str
    status: str


class DocumentDetailResponse(BaseModel):
    id: str
    content: str
    containerTag: Optional[str] = None
    customId: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    status: str
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class BatchDocumentResponse(BaseModel):
    results: list[DocumentResponse]
    success: int
    failed: int


class DocumentListResponse(BaseModel):
    documents: list[DocumentDetailResponse]
    total: int


# ── Memories ───────────────────────────────────────────────────────

class CreateMemoryRequest(BaseModel):
    content: str
    containerTag: Optional[str] = None
    type: str = Field(default="fact", pattern="^(fact|preference|episode)$")
    isStatic: bool = False
    metadata: Optional[dict[str, Any]] = None


class BatchMemoryItem(BaseModel):
    content: str
    type: str = Field(default="fact")
    isStatic: bool = False
    metadata: Optional[dict[str, Any]] = None


class BatchCreateMemoriesRequest(BaseModel):
    memories: list[BatchMemoryItem] = Field(..., min_length=1, max_length=100)
    containerTag: str


class UpdateMemoryRequest(BaseModel):
    content: Optional[str] = None
    newContent: Optional[str] = None  # supermemory v4 compat
    metadata: Optional[dict[str, Any]] = None


class MemoryResponse(BaseModel):
    id: str
    memory: str
    type: str
    isStatic: bool = False
    similarity: Optional[float] = None
    isLatest: bool = True
    containerTag: Optional[str] = None
    createdAt: Optional[str] = None
    version: int = 1
    metadata: Optional[dict[str, Any]] = None


class MemoryListResponse(BaseModel):
    memories: list[MemoryResponse]
    total: int


class BatchMemoryResponse(BaseModel):
    documentId: Optional[str] = None
    memories: list[MemoryResponse]


# ── Search ─────────────────────────────────────────────────────────

class MetadataFilter(BaseModel):
    key: str
    value: Any
    filterType: Optional[str] = None  # string_contains, numeric, array_contains
    numericOperator: Optional[str] = None
    negate: bool = False


class SearchFilters(BaseModel):
    AND: Optional[list[MetadataFilter]] = None
    OR: Optional[list[MetadataFilter]] = None


class SearchMemoriesRequest(BaseModel):
    q: str
    containerTag: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=100)
    threshold: float = Field(default=0.0, ge=0.0, le=1.0)
    searchMode: str = Field(default="hybrid", pattern="^(hybrid|memories|documents)$")
    rerank: bool = False
    filters: Optional[SearchFilters] = None
    metadata: Optional[dict[str, Any]] = None  # Legacy compat


class SearchDocumentsRequest(BaseModel):
    q: str
    containerTag: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=100)
    filters: Optional[SearchFilters] = None
    metadata: Optional[dict[str, Any]] = None


class SearchResultsResponse(BaseModel):
    results: list[dict[str, Any]]
    timing: Optional[int] = None  # ms
    total: Optional[int] = None


# ── Profile ────────────────────────────────────────────────────────

class ProfileRequest(BaseModel):
    containerTag: str
    q: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=100)
    threshold: float = Field(default=0.0, ge=0.0, le=1.0)


class ProfileData(BaseModel):
    static: list[str] = []
    dynamic: list[str] = []


class ProfileResponse(BaseModel):
    profile: ProfileData
    searchResults: SearchResultsResponse


# ── Settings ───────────────────────────────────────────────────────

class UpdateOrgSettingsRequest(BaseModel):
    filterPrompt: Optional[str] = None
    shouldLLMFilter: Optional[bool] = None
    chunkSize: Optional[int] = Field(None, ge=128, le=4096)
    rerankEnabled: Optional[bool] = None


class UpdateContainerSettingsRequest(BaseModel):
    entityContext: Optional[str] = Field(None, max_length=1500)
    filterPrompt: Optional[str] = None
    chunkSize: Optional[int] = Field(None, ge=128, le=4096)


# ── Health ─────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "memoclaw"
    version: str = "0.2.0"


class ReadyResponse(BaseModel):
    status: str
    database: str
    llm: str
    embedding: str
