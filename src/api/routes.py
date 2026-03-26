"""API routes — Documents, Memories, Search, Profile, Settings, Health."""

from __future__ import annotations

import uuid
import time
import asyncio
import hashlib
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, func, and_

from src.db import get_session
from src.models import Document, Memory, Chunk, OrgSettings, ContainerSettings
from src.core import memory_engine
from src.api.schemas import *

logger = structlog.get_logger()

documents_router = APIRouter(prefix="/v1/documents", tags=["Documents"])
memories_router = APIRouter(prefix="/v1/memories", tags=["Memories"])
search_router = APIRouter(prefix="/v1/search", tags=["Search"])
profile_router = APIRouter(prefix="/v1", tags=["Profile"])
settings_router = APIRouter(prefix="/v1/settings", tags=["Settings"])
health_router = APIRouter(tags=["Health"])

_bg: set[asyncio.Task] = set()
def _fire(coro):
    t = asyncio.create_task(coro); _bg.add(t); t.add_done_callback(_bg.discard)


# ── Documents ──────────────────────────────────────────────────────

@documents_router.post("", response_model=DocumentResponse)
async def add_document(req: AddDocumentRequest):
    async with get_session() as s:
        # customId dedup + diff
        previous_content = None
        if req.customId:
            stmt = select(Document).where(and_(
                Document.custom_id == req.customId,
                Document.container_tag == req.containerTag))
            existing = (await s.execute(stmt)).scalar_one_or_none()
            if existing:
                new_hash = hashlib.sha256(req.content.encode()).hexdigest()
                if existing.content_hash == new_hash:
                    return DocumentResponse(id=str(existing.id), status=existing.status)
                previous_content = existing.content
                existing.previous_content = existing.content
                existing.content = req.content
                existing.status = "queued"
                existing.entity_context = req.entityContext or existing.entity_context
                if req.metadata:
                    existing.metadata_ = req.metadata
                await s.flush()
                _fire(_process_bg(existing.id))
                return DocumentResponse(id=str(existing.id), status="queued")

        doc = Document(content=req.content, container_tag=req.containerTag,
                       custom_id=req.customId, metadata_=req.metadata or {},
                       entity_context=req.entityContext, status="queued",
                       content_hash=hashlib.sha256(req.content.encode()).hexdigest(),
                       previous_content=previous_content)
        s.add(doc)
        await s.flush()
        doc_id = doc.id
    _fire(_process_bg(doc_id))
    return DocumentResponse(id=str(doc_id), status="queued")


async def _process_bg(doc_id):
    try:
        async with get_session() as s:
            await memory_engine.process_document(s, doc_id)
    except Exception as e:
        logger.error("bg_fail", doc_id=str(doc_id), error=str(e))


@documents_router.post("/batch", response_model=BatchDocumentResponse)
async def batch_add_documents(req: BatchAddDocumentsRequest):
    results, ok, fail = [], 0, 0
    async with get_session() as s:
        for item in req.documents:
            try:
                doc = Document(content=item.content,
                               container_tag=item.containerTag or req.containerTag,
                               custom_id=item.customId,
                               metadata_=item.metadata or req.metadata or {},
                               status="queued",
                               content_hash=hashlib.sha256(item.content.encode()).hexdigest())
                s.add(doc); await s.flush()
                results.append(DocumentResponse(id=str(doc.id), status="queued"))
                _fire(_process_bg(doc.id)); ok += 1
            except Exception:
                results.append(DocumentResponse(id="", status="error")); fail += 1
    return BatchDocumentResponse(results=results, success=ok, failed=fail)


@documents_router.get("", response_model=DocumentListResponse)
async def list_documents(container_tag: str | None = None, status: str | None = None,
                         limit: int = 50, offset: int = 0):
    async with get_session() as s:
        conds = []
        if container_tag: conds.append(Document.container_tag == container_tag)
        if status: conds.append(Document.status == status)
        total = (await s.execute(select(func.count(Document.id)).where(and_(*conds) if conds else True))).scalar() or 0
        docs = (await s.execute(select(Document).where(and_(*conds) if conds else True)
                .order_by(Document.created_at.desc()).limit(limit).offset(offset))).scalars().all()
        return DocumentListResponse(documents=[
            DocumentDetailResponse(id=str(d.id), content=d.content[:500], containerTag=d.container_tag,
                customId=d.custom_id, metadata=d.metadata_, status=d.status,
                createdAt=d.created_at.isoformat() if d.created_at else None,
                updatedAt=d.updated_at.isoformat() if d.updated_at else None)
            for d in docs], total=total)


@documents_router.get("/{doc_id}", response_model=DocumentDetailResponse)
async def get_document(doc_id: uuid.UUID):
    async with get_session() as s:
        doc = await s.get(Document, doc_id)
        if not doc: raise HTTPException(404, "Not found")
        return DocumentDetailResponse(id=str(doc.id), content=doc.content, containerTag=doc.container_tag,
            customId=doc.custom_id, metadata=doc.metadata_, status=doc.status,
            createdAt=doc.created_at.isoformat() if doc.created_at else None,
            updatedAt=doc.updated_at.isoformat() if doc.updated_at else None)


@documents_router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(doc_id: uuid.UUID, req: UpdateDocumentRequest):
    async with get_session() as s:
        doc = await s.get(Document, doc_id)
        if not doc: raise HTTPException(404, "Not found")
        if req.content is not None:
            doc.previous_content = doc.content
            doc.content = req.content; doc.status = "queued"
            doc.content_hash = hashlib.sha256(req.content.encode()).hexdigest()
        if req.containerTag is not None: doc.container_tag = req.containerTag
        if req.customId is not None: doc.custom_id = req.customId
        if req.metadata is not None: doc.metadata_ = req.metadata
        await s.flush()
        if req.content is not None: _fire(_process_bg(doc.id))
        return DocumentResponse(id=str(doc.id), status=doc.status)


@documents_router.delete("/{doc_id}")
async def delete_document(doc_id: uuid.UUID):
    async with get_session() as s:
        doc = await s.get(Document, doc_id)
        if not doc: raise HTTPException(404, "Not found")
        await s.delete(doc)
    return {"status": "deleted", "id": str(doc_id)}


# ── Memories ───────────────────────────────────────────────────────

@memories_router.post("", response_model=MemoryResponse)
async def create_memory(req: CreateMemoryRequest):
    async with get_session() as s:
        mem = await memory_engine.create_memory_direct(s, content=req.content,
            container_tag=req.containerTag, memory_type=req.type,
            is_static=req.isStatic, metadata=req.metadata)
        return _mem_resp(mem)


@memories_router.post("/batch", response_model=BatchMemoryResponse)
async def batch_create_memories(req: BatchCreateMemoriesRequest):
    """Create multiple memories directly — supermemory v4 compatible."""
    async with get_session() as s:
        mems = await memory_engine.create_memories_batch(
            s, [m.model_dump() for m in req.memories], req.containerTag)
        return BatchMemoryResponse(
            memories=[_mem_resp(m) for m in mems])


@memories_router.get("", response_model=MemoryListResponse)
async def list_memories(container_tag: str | None = None,
                        include_forgotten: bool = False, limit: int = 50, offset: int = 0):
    async with get_session() as s:
        conds = []
        if container_tag: conds.append(Memory.container_tag == container_tag)
        if not include_forgotten: conds.append(Memory.is_forgotten == False)
        total = (await s.execute(select(func.count(Memory.id)).where(and_(*conds) if conds else True))).scalar() or 0
        mems = (await s.execute(select(Memory).where(and_(*conds) if conds else True)
                .order_by(Memory.created_at.desc()).limit(limit).offset(offset))).scalars().all()
        return MemoryListResponse(memories=[_mem_resp(m) for m in mems], total=total)


@memories_router.delete("/{memory_id}")
async def forget_memory(memory_id: uuid.UUID):
    async with get_session() as s:
        if not await memory_engine.forget_memory(s, memory_id):
            raise HTTPException(404, "Not found")
    return {"status": "forgotten", "id": str(memory_id)}


@memories_router.patch("/{memory_id}", response_model=MemoryResponse)
async def update_memory(memory_id: uuid.UUID, req: UpdateMemoryRequest):
    content = req.newContent or req.content
    if not content: raise HTTPException(400, "content or newContent required")
    async with get_session() as s:
        new = await memory_engine.update_memory(s, memory_id, content)
        if not new: raise HTTPException(404, "Not found")
        return _mem_resp(new)


def _mem_resp(m: Memory) -> MemoryResponse:
    return MemoryResponse(id=str(m.id), memory=m.content, type=m.memory_type,
        isStatic=m.is_static, isLatest=m.is_latest, containerTag=m.container_tag,
        createdAt=m.created_at.isoformat() if m.created_at else None,
        version=m.version or 1, metadata=m.metadata_)


# ── Search ─────────────────────────────────────────────────────────

@search_router.post("/memories", response_model=SearchResultsResponse)
async def search_memories(req: SearchMemoriesRequest):
    t0 = time.monotonic()
    async with get_session() as s:
        filters = req.filters.model_dump() if req.filters else (
            {"AND": [{"key": k, "value": v} for k, v in req.metadata.items()]} if req.metadata else None)
        results = await memory_engine.search_memories(s, query=req.q,
            container_tag=req.containerTag, limit=req.limit, threshold=req.threshold,
            search_mode=req.searchMode, metadata_filter=filters, rerank=req.rerank)
        return SearchResultsResponse(results=results, timing=int((time.monotonic()-t0)*1000), total=len(results))


@search_router.post("/documents", response_model=SearchResultsResponse)
async def search_documents(req: SearchDocumentsRequest):
    t0 = time.monotonic()
    async with get_session() as s:
        results = await memory_engine.search_documents(s, query=req.q,
            container_tag=req.containerTag, limit=req.limit)
        return SearchResultsResponse(results=results, timing=int((time.monotonic()-t0)*1000), total=len(results))


# ── Profile ────────────────────────────────────────────────────────

@profile_router.post("/profile", response_model=ProfileResponse)
async def get_profile(req: ProfileRequest):
    async with get_session() as s:
        r = await memory_engine.get_profile(s, container_tag=req.containerTag,
            query=req.q, limit=req.limit, threshold=req.threshold)
        return ProfileResponse(profile=ProfileData(**r["profile"]),
            searchResults=SearchResultsResponse(**r["searchResults"]))


# ── Settings ───────────────────────────────────────────────────────

@settings_router.get("")
async def get_settings():
    async with get_session() as s:
        org = (await s.execute(select(OrgSettings).limit(1))).scalar_one_or_none()
        if not org:
            return {"filterPrompt": None, "shouldLLMFilter": False, "chunkSize": 512, "rerankEnabled": False}
        return {"filterPrompt": org.filter_prompt, "shouldLLMFilter": org.should_llm_filter,
                "chunkSize": org.default_chunk_size, "rerankEnabled": org.rerank_enabled}


@settings_router.patch("")
async def update_settings(req: UpdateOrgSettingsRequest):
    async with get_session() as s:
        org = (await s.execute(select(OrgSettings).limit(1))).scalar_one_or_none()
        if not org:
            org = OrgSettings(); s.add(org)
        if req.filterPrompt is not None: org.filter_prompt = req.filterPrompt
        if req.shouldLLMFilter is not None: org.should_llm_filter = req.shouldLLMFilter
        if req.chunkSize is not None: org.default_chunk_size = req.chunkSize
        if req.rerankEnabled is not None: org.rerank_enabled = req.rerankEnabled
    return {"status": "ok"}


@settings_router.get("/containers/{tag}")
async def get_container_settings(tag: str):
    async with get_session() as s:
        cfg = (await s.execute(select(ContainerSettings).where(
            ContainerSettings.container_tag == tag))).scalar_one_or_none()
        if not cfg: return {"containerTag": tag, "entityContext": None, "filterPrompt": None, "chunkSize": None}
        return {"containerTag": cfg.container_tag, "entityContext": cfg.entity_context,
                "filterPrompt": cfg.filter_prompt, "chunkSize": cfg.chunk_size}


@settings_router.patch("/containers/{tag}")
async def update_container_settings(tag: str, req: UpdateContainerSettingsRequest):
    async with get_session() as s:
        cfg = (await s.execute(select(ContainerSettings).where(
            ContainerSettings.container_tag == tag))).scalar_one_or_none()
        if not cfg:
            cfg = ContainerSettings(container_tag=tag); s.add(cfg)
        if req.entityContext is not None: cfg.entity_context = req.entityContext
        if req.filterPrompt is not None: cfg.filter_prompt = req.filterPrompt
        if req.chunkSize is not None: cfg.chunk_size = req.chunkSize
    return {"status": "ok"}


# ── Health ─────────────────────────────────────────────────────────

@health_router.get("/health", response_model=HealthResponse)
async def health(): return HealthResponse()

@health_router.get("/health/ready", response_model=ReadyResponse)
async def ready():
    db_s = llm_s = emb_s = "ok"
    try:
        async with get_session() as s:
            from sqlalchemy import text as sqlt
            await s.execute(sqlt("SELECT 1"))
    except Exception as e: db_s = f"error: {str(e)[:100]}"
    try:
        from src.llm import llm_client
        await llm_client.chat([{"role": "user", "content": "ping"}], max_tokens=5)
    except Exception as e: llm_s = f"error: {str(e)[:100]}"
    try:
        from src.llm import embedding_client
        await embedding_client.embed_one("test")
    except Exception as e: emb_s = f"error: {str(e)[:100]}"
    return ReadyResponse(status="ok" if all(s == "ok" for s in [db_s, llm_s, emb_s]) else "degraded",
                         database=db_s, llm=llm_s, embedding=emb_s)
