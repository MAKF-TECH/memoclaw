"""API routes — Documents, Memories, Search, Profile, Health."""

from __future__ import annotations

import uuid
import asyncio
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func, and_

from src.db import get_session
from src.models import Document, Memory
from src.core import memory_engine
from src.api.schemas import (
    AddDocumentRequest,
    BatchAddDocumentsRequest,
    UpdateDocumentRequest,
    DocumentResponse,
    DocumentDetailResponse,
    BatchDocumentResponse,
    DocumentListResponse,
    CreateMemoryRequest,
    UpdateMemoryRequest,
    MemoryResponse,
    MemoryListResponse,
    SearchMemoriesRequest,
    SearchDocumentsRequest,
    SearchResultsResponse,
    ProfileRequest,
    ProfileResponse,
    ProfileData,
    HealthResponse,
    ReadyResponse,
)

logger = structlog.get_logger()

# ── Routers ────────────────────────────────────────────────────────

documents_router = APIRouter(prefix="/v1/documents", tags=["Documents"])
memories_router = APIRouter(prefix="/v1/memories", tags=["Memories"])
search_router = APIRouter(prefix="/v1/search", tags=["Search"])
profile_router = APIRouter(prefix="/v1", tags=["Profile"])
health_router = APIRouter(tags=["Health"])


# ── Background task runner ─────────────────────────────────────────

_background_tasks: set[asyncio.Task] = set()


def _run_in_background(coro):
    """Fire-and-forget a coroutine as a background task."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# ── Documents ──────────────────────────────────────────────────────


@documents_router.post("", response_model=DocumentResponse)
async def add_document(req: AddDocumentRequest):
    """Add a document and start async processing."""
    async with get_session() as session:
        doc = Document(
            content=req.content,
            container_tag=req.containerTag,
            custom_id=req.customId,
            metadata_=req.metadata or {},
            entity_context=req.entityContext,
            status="queued",
        )
        session.add(doc)
        await session.flush()
        doc_id = doc.id
        doc_status = doc.status

    # Process in background
    _run_in_background(_process_document_bg(doc_id))

    return DocumentResponse(id=str(doc_id), status=doc_status)


async def _process_document_bg(doc_id: uuid.UUID):
    """Background document processing."""
    try:
        async with get_session() as session:
            await memory_engine.process_document(session, doc_id)
    except Exception as e:
        logger.error("bg_processing_failed", doc_id=str(doc_id), error=str(e))


@documents_router.post("/batch", response_model=BatchDocumentResponse)
async def batch_add_documents(req: BatchAddDocumentsRequest):
    """Batch add multiple documents."""
    results = []
    success = 0
    failed = 0

    async with get_session() as session:
        for item in req.documents:
            try:
                doc = Document(
                    content=item.content,
                    container_tag=item.containerTag or req.containerTag,
                    custom_id=item.customId,
                    metadata_=item.metadata or req.metadata or {},
                    status="queued",
                )
                session.add(doc)
                await session.flush()
                results.append(DocumentResponse(id=str(doc.id), status="queued"))
                _run_in_background(_process_document_bg(doc.id))
                success += 1
            except Exception as e:
                results.append(DocumentResponse(id="", status="error"))
                failed += 1
                logger.error("batch_item_failed", error=str(e))

    return BatchDocumentResponse(results=results, success=success, failed=failed)


@documents_router.get("", response_model=DocumentListResponse)
async def list_documents(
    container_tag: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """List documents with optional filtering."""
    async with get_session() as session:
        conditions = []
        if container_tag:
            conditions.append(Document.container_tag == container_tag)
        if status:
            conditions.append(Document.status == status)

        count_stmt = select(func.count(Document.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total = (await session.execute(count_stmt)).scalar() or 0

        stmt = (
            select(Document)
            .where(and_(*conditions) if conditions else True)
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(stmt)
        docs = result.scalars().all()

        return DocumentListResponse(
            documents=[
                DocumentDetailResponse(
                    id=str(d.id),
                    content=d.content[:500],
                    containerTag=d.container_tag,
                    customId=d.custom_id,
                    metadata=d.metadata_,
                    status=d.status,
                    createdAt=d.created_at.isoformat() if d.created_at else None,
                    updatedAt=d.updated_at.isoformat() if d.updated_at else None,
                )
                for d in docs
            ],
            total=total,
        )


@documents_router.get("/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(doc_id: uuid.UUID):
    """Get a document by ID."""
    async with get_session() as session:
        doc = await session.get(Document, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return DocumentDetailResponse(
            id=str(doc.id),
            content=doc.content,
            containerTag=doc.container_tag,
            customId=doc.custom_id,
            metadata=doc.metadata_,
            status=doc.status,
            createdAt=doc.created_at.isoformat() if doc.created_at else None,
            updatedAt=doc.updated_at.isoformat() if doc.updated_at else None,
        )


@documents_router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(doc_id: uuid.UUID, req: UpdateDocumentRequest):
    """Update a document."""
    async with get_session() as session:
        doc = await session.get(Document, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        if req.content is not None:
            doc.content = req.content
            doc.status = "queued"
        if req.containerTag is not None:
            doc.container_tag = req.containerTag
        if req.customId is not None:
            doc.custom_id = req.customId
        if req.metadata is not None:
            doc.metadata_ = req.metadata

        await session.flush()

        # Reprocess if content changed
        if req.content is not None:
            _run_in_background(_process_document_bg(doc.id))

        return DocumentResponse(id=str(doc.id), status=doc.status)


@documents_router.delete("/{doc_id}")
async def delete_document(doc_id: uuid.UUID):
    """Delete a document and its memories."""
    async with get_session() as session:
        doc = await session.get(Document, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        await session.delete(doc)
    return {"status": "deleted", "id": str(doc_id)}


# ── Memories ───────────────────────────────────────────────────────


@memories_router.post("", response_model=MemoryResponse)
async def create_memory(req: CreateMemoryRequest):
    """Create a memory directly (bypass document ingestion)."""
    async with get_session() as session:
        mem = await memory_engine.create_memory_direct(
            session,
            content=req.content,
            container_tag=req.containerTag,
            memory_type=req.type,
            metadata=req.metadata,
        )
        return MemoryResponse(
            id=str(mem.id),
            memory=mem.content,
            type=mem.memory_type,
            isLatest=mem.is_latest,
            containerTag=mem.container_tag,
            createdAt=mem.created_at.isoformat() if mem.created_at else None,
            metadata=mem.metadata_,
        )


@memories_router.get("", response_model=MemoryListResponse)
async def list_memories(
    container_tag: str | None = None,
    include_forgotten: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    """List memories with optional filtering."""
    async with get_session() as session:
        conditions = []
        if container_tag:
            conditions.append(Memory.container_tag == container_tag)
        if not include_forgotten:
            conditions.append(Memory.is_forgotten == False)

        count_stmt = select(func.count(Memory.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total = (await session.execute(count_stmt)).scalar() or 0

        stmt = (
            select(Memory)
            .where(and_(*conditions) if conditions else True)
            .order_by(Memory.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(stmt)
        mems = result.scalars().all()

        return MemoryListResponse(
            memories=[
                MemoryResponse(
                    id=str(m.id),
                    memory=m.content,
                    type=m.memory_type,
                    isLatest=m.is_latest,
                    containerTag=m.container_tag,
                    createdAt=m.created_at.isoformat() if m.created_at else None,
                    metadata=m.metadata_,
                )
                for m in mems
            ],
            total=total,
        )


@memories_router.delete("/{memory_id}")
async def forget_memory(memory_id: uuid.UUID):
    """Soft-delete (forget) a memory."""
    async with get_session() as session:
        success = await memory_engine.forget_memory(session, memory_id)
        if not success:
            raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "forgotten", "id": str(memory_id)}


@memories_router.patch("/{memory_id}", response_model=MemoryResponse)
async def update_memory(memory_id: uuid.UUID, req: UpdateMemoryRequest):
    """Update a memory (creates new version, preserves old)."""
    async with get_session() as session:
        new_mem = await memory_engine.update_memory(session, memory_id, req.content)
        if not new_mem:
            raise HTTPException(status_code=404, detail="Memory not found")
        return MemoryResponse(
            id=str(new_mem.id),
            memory=new_mem.content,
            type=new_mem.memory_type,
            isLatest=new_mem.is_latest,
            containerTag=new_mem.container_tag,
            createdAt=new_mem.created_at.isoformat() if new_mem.created_at else None,
            metadata=new_mem.metadata_,
        )


# ── Search ─────────────────────────────────────────────────────────


@search_router.post("/memories", response_model=SearchResultsResponse)
async def search_memories(req: SearchMemoriesRequest):
    """Hybrid search across memories."""
    async with get_session() as session:
        results = await memory_engine.search_memories(
            session,
            query=req.q,
            container_tag=req.containerTag,
            limit=req.limit,
            threshold=req.threshold,
            search_mode=req.searchMode,
            metadata_filter=req.metadata,
        )
        return SearchResultsResponse(results=results)


@search_router.post("/documents", response_model=SearchResultsResponse)
async def search_documents(req: SearchDocumentsRequest):
    """Search documents."""
    async with get_session() as session:
        results = await memory_engine.search_documents(
            session,
            query=req.q,
            container_tag=req.containerTag,
            limit=req.limit,
            metadata_filter=req.metadata,
        )
        return SearchResultsResponse(results=results)


# ── Profile ────────────────────────────────────────────────────────


@profile_router.post("/profile", response_model=ProfileResponse)
async def get_profile(req: ProfileRequest):
    """Get user profile + optional search results."""
    async with get_session() as session:
        result = await memory_engine.get_profile(
            session,
            container_tag=req.containerTag,
            query=req.q,
            limit=req.limit,
            threshold=req.threshold,
        )
        return ProfileResponse(
            profile=ProfileData(**result["profile"]),
            searchResults=SearchResultsResponse(**result["searchResults"]),
        )


# ── Health ─────────────────────────────────────────────────────────


@health_router.get("/health", response_model=HealthResponse)
async def health_check():
    """Basic health check."""
    return HealthResponse()


@health_router.get("/health/ready", response_model=ReadyResponse)
async def readiness_check():
    """Readiness check — verify all dependencies."""
    db_status = "ok"
    llm_status = "ok"
    emb_status = "ok"

    # Check database
    try:
        async with get_session() as session:
            from sqlalchemy import text
            await session.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {str(e)[:100]}"

    # Check LLM
    try:
        from src.llm import llm_client
        await llm_client.chat(
            [{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
    except Exception as e:
        llm_status = f"error: {str(e)[:100]}"

    # Check embedding
    try:
        from src.llm import embedding_client
        await embedding_client.embed_one("test")
    except Exception as e:
        emb_status = f"error: {str(e)[:100]}"

    overall = "ok" if all(s == "ok" for s in [db_status, llm_status, emb_status]) else "degraded"

    return ReadyResponse(
        status=overall,
        database=db_status,
        llm=llm_status,
        embedding=emb_status,
    )
