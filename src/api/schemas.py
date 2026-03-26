"""Pydantic schemas for API request/response models."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field


# ── Documents ──────────────────────────────────────────────────────

class AddDocumentRequest(BaseModel):
    content: str = Field(..., description="Text, URL, or content to process")
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
    metadata: Optional[dict[str, Any]] = None


class UpdateMemoryRequest(BaseModel):
    content: str


class MemoryResponse(BaseModel):
    id: str
    memory: str
    type: str
    similarity: Optional[float] = None
    isLatest: bool = True
    containerTag: Optional[str] = None
    createdAt: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class MemoryListResponse(BaseModel):
    memories: list[MemoryResponse]
    total: int


# ── Search ─────────────────────────────────────────────────────────

class SearchMemoriesRequest(BaseModel):
    q: str = Field(..., description="Search query")
    containerTag: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=100)
    threshold: float = Field(default=0.0, ge=0.0, le=1.0)
    searchMode: str = Field(default="hybrid", pattern="^(hybrid|memories|documents)$")
    metadata: Optional[dict[str, Any]] = None


class SearchDocumentsRequest(BaseModel):
    q: str
    containerTag: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=100)
    metadata: Optional[dict[str, Any]] = None


class SearchResultsResponse(BaseModel):
    results: list[dict[str, Any]]


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


# ── Health ─────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "memoclaw"
    version: str = "0.1.0"


class ReadyResponse(BaseModel):
    status: str
    database: str
    llm: str
    embedding: str
