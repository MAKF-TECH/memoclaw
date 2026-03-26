"""Core memory engine — supermemory-compatible extraction, graph, search, profiles."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func, and_, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models import Document, Memory, MemoryEdge, UserProfile, Chunk, ContainerSettings, OrgSettings
from src.llm import llm_client, embedding_client
from src.llm.prompts import (
    EXTRACT_MEMORIES_SYSTEM, EXTRACT_MEMORIES_USER,
    DETECT_RELATIONS_SYSTEM, DETECT_RELATIONS_USER,
    BUILD_PROFILE_SYSTEM, BUILD_PROFILE_USER,
    REWRITE_QUERY_SYSTEM, REWRITE_QUERY_USER,
    RERANK_SYSTEM, RERANK_USER,
    FILTER_CONTENT_SYSTEM, FILTER_CONTENT_USER,
    DETECT_DIFF_SYSTEM, DETECT_DIFF_USER,
)

logger = structlog.get_logger()


class MemoryEngine:
    """Orchestrates memory extraction, graph, search, and profiles."""

    # ── Document Processing ────────────────────────────────────────

    async def process_document(self, session: AsyncSession, doc_id: uuid.UUID) -> None:
        """Full pipeline: filter → diff → chunk → extract → embed → relate → profile."""
        doc = await session.get(Document, doc_id)
        if not doc:
            return

        try:
            doc.status = "extracting"
            await session.flush()

            # 1. Get org + container settings
            org = await self._get_org_settings(session)
            container_cfg = await self._get_container_settings(session, doc.container_tag)
            entity_ctx = doc.entity_context or (container_cfg.entity_context if container_cfg else None) or ""
            filter_prompt = (container_cfg.filter_prompt if container_cfg else None) or (org.filter_prompt if org else None) or ""

            # 2. Content filtering (if enabled)
            content = doc.content
            if org and org.should_llm_filter and filter_prompt:
                should_index = await self._filter_content(content, filter_prompt)
                if not should_index:
                    doc.status = "done"
                    logger.info("document_filtered_out", doc_id=str(doc_id))
                    return

            # 3. Diff detection for customId updates
            if doc.custom_id and doc.previous_content:
                diff_result = await self._detect_diff(doc.previous_content, content)
                if not diff_result.get("has_new_info"):
                    doc.status = "done"
                    logger.info("no_new_content", doc_id=str(doc_id))
                    return
                content = diff_result.get("new_content", content)

            # 4. Chunking
            doc.status = "chunking"
            await session.flush()
            chunk_size = (container_cfg.chunk_size if container_cfg and container_cfg.chunk_size else None) or \
                         (org.default_chunk_size if org else 512)
            raw_chunks = self._chunk_text(content, chunk_size)

            # 5. Extract memories from content
            filter_ctx = f"Filter guidance: {filter_prompt}" if filter_prompt else ""
            memories_data = await self._extract_memories(content, entity_ctx, filter_ctx)

            # 6. Embed everything
            doc.status = "embedding"
            await session.flush()

            all_texts = [m["content"] for m in memories_data] + raw_chunks
            if not all_texts:
                doc.status = "done"
                return

            all_embeddings = await embedding_client.embed(all_texts)
            mem_embeddings = all_embeddings[:len(memories_data)]
            chunk_embeddings = all_embeddings[len(memories_data):]

            # 7. Index memories
            doc.status = "indexing"
            await session.flush()

            new_memories = []
            for i, (mdata, emb) in enumerate(zip(memories_data, mem_embeddings)):
                mem = Memory(
                    document_id=doc.id,
                    container_tag=doc.container_tag,
                    content=mdata["content"],
                    memory_type=mdata.get("type", "fact"),
                    is_static=mdata.get("is_static", False),
                    embedding=emb,
                    expires_at=_parse_dt(mdata.get("expires_at")),
                    source_chunk_index=i,
                    metadata_=doc.metadata_,
                )
                session.add(mem)
                new_memories.append(mem)

            # 8. Index chunks (RAG layer)
            for i, (chunk_text, emb) in enumerate(zip(raw_chunks, chunk_embeddings)):
                chunk = Chunk(
                    document_id=doc.id,
                    container_tag=doc.container_tag,
                    content=chunk_text,
                    chunk_index=i,
                    embedding=emb,
                    metadata_=doc.metadata_,
                )
                session.add(chunk)

            await session.flush()

            # 9. Detect relations
            await self._detect_relations(session, new_memories)

            # 10. Store content hash for future diffs
            doc.content_hash = hashlib.sha256(doc.content.encode()).hexdigest()
            doc.status = "done"

            logger.info("document_processed", doc_id=str(doc.id),
                        memories=len(new_memories), chunks=len(raw_chunks))

            # 11. Rebuild profile (best-effort)
            if doc.container_tag:
                try:
                    await self.rebuild_profile(session, doc.container_tag)
                except Exception as e:
                    logger.warning("profile_rebuild_failed", error=str(e))

        except Exception as e:
            doc.status = "error"
            doc.error_message = str(e)[:500]
            logger.error("processing_failed", doc_id=str(doc_id), error=str(e))
            raise

    # ── Chunking ───────────────────────────────────────────────────

    def _chunk_text(self, text: str, chunk_size: int = 512) -> list[str]:
        """Split text into overlapping chunks."""
        if len(text) <= chunk_size:
            return [text]
        chunks = []
        overlap = min(50, chunk_size // 4)
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            if chunk.strip():
                chunks.append(chunk.strip())
            start = end - overlap
        return chunks

    # ── Extraction ─────────────────────────────────────────────────

    async def _extract_memories(self, content: str, entity_ctx: str, filter_ctx: str) -> list[dict]:
        """LLM extraction of atomic memories."""
        messages = [
            {"role": "system", "content": EXTRACT_MEMORIES_SYSTEM},
            {"role": "user", "content": EXTRACT_MEMORIES_USER.format(
                content=content[:10000],
                entity_context=entity_ctx or "No additional context",
                filter_context=filter_ctx,
            )},
        ]
        result = await llm_client.chat_json(messages)
        memories = result.get("memories", [])
        logger.debug("memories_extracted", count=len(memories))
        return memories

    async def _detect_relations(self, session: AsyncSession, new_memories: list[Memory]) -> None:
        """Detect graph relationships between new and existing memories."""
        for mem in new_memories:
            if not mem.container_tag:
                continue
            new_ids = [m.id for m in new_memories]
            stmt = (select(Memory)
                    .where(and_(
                        Memory.container_tag == mem.container_tag,
                        Memory.is_latest == True, Memory.is_forgotten == False,
                        ~Memory.id.in_(new_ids)))
                    .order_by(Memory.created_at.desc()).limit(50))
            result = await session.execute(stmt)
            existing = result.scalars().all()
            if not existing:
                continue

            existing_str = "\n".join(f"[{str(m.id)}] {m.content}" for m in existing)
            messages = [
                {"role": "system", "content": DETECT_RELATIONS_SYSTEM},
                {"role": "user", "content": DETECT_RELATIONS_USER.format(
                    new_memory=mem.content, existing_memories=existing_str)},
            ]
            try:
                result_data = await llm_client.chat_json(messages)
                existing_ids = {str(m.id) for m in existing}
                for rel in result_data.get("relations", []):
                    eid = rel.get("existing_memory_id")
                    if not eid or eid not in existing_ids:
                        continue
                    edge = MemoryEdge(
                        source_id=mem.id, target_id=uuid.UUID(eid),
                        relation_type=rel["relation_type"],
                        confidence=rel.get("confidence", 1.0))
                    session.add(edge)
                    if rel["relation_type"] == "updates":
                        old = await session.get(Memory, uuid.UUID(eid))
                        if old:
                            old.is_latest = False
            except Exception as e:
                logger.warning("relation_detection_failed", error=str(e))

    # ── Content Filtering ──────────────────────────────────────────

    async def _filter_content(self, content: str, filter_prompt: str) -> bool:
        """Ask LLM if content should be indexed."""
        messages = [
            {"role": "system", "content": FILTER_CONTENT_SYSTEM},
            {"role": "user", "content": FILTER_CONTENT_USER.format(
                filter_prompt=filter_prompt, content=content[:5000])},
        ]
        try:
            result = await llm_client.chat_json(messages)
            return result.get("should_index", True)
        except Exception:
            return True  # Default: index on failure

    # ── Diff Detection ─────────────────────────────────────────────

    async def _detect_diff(self, old_content: str, new_content: str) -> dict:
        """Detect new information in updated content."""
        messages = [
            {"role": "system", "content": DETECT_DIFF_SYSTEM},
            {"role": "user", "content": DETECT_DIFF_USER.format(
                old_content=old_content[:5000], new_content=new_content[:5000])},
        ]
        try:
            return await llm_client.chat_json(messages)
        except Exception:
            return {"has_new_info": True, "new_content": new_content}

    # ── Search ─────────────────────────────────────────────────────

    async def search_memories(
        self, session: AsyncSession, query: str,
        container_tag: str | None = None, limit: int = 10,
        threshold: float = 0.0, search_mode: str = "hybrid",
        metadata_filter: dict | None = None, rerank: bool = False,
    ) -> list[dict]:
        """Hybrid search: memories + chunks, with optional reranking."""

        # Optional query rewriting
        org = await self._get_org_settings(session)
        search_query = query

        # Get query embedding
        query_emb = await embedding_client.embed_one(search_query)
        results = []

        # Search memories
        if search_mode in ("hybrid", "memories"):
            conditions = [Memory.is_forgotten == False, Memory.is_latest == True]
            if container_tag:
                conditions.append(Memory.container_tag == container_tag)
            if metadata_filter:
                conditions.extend(self._build_metadata_conditions(Memory, metadata_filter))

            stmt = (select(Memory, Memory.embedding.cosine_distance(query_emb).label("dist"))
                    .where(and_(*conditions)).order_by("dist").limit(limit * 2))
            rows = (await session.execute(stmt)).all()
            for mem, dist in rows:
                sim = 1.0 - dist
                if sim < threshold:
                    continue
                results.append({
                    "id": str(mem.id), "memory": mem.content, "type": mem.memory_type,
                    "is_static": mem.is_static, "similarity": round(sim, 4),
                    "is_latest": mem.is_latest, "container_tag": mem.container_tag,
                    "created_at": mem.created_at.isoformat() if mem.created_at else None,
                    "version": mem.version, "metadata": mem.metadata_,
                })

        # Search chunks (RAG layer)
        if search_mode == "hybrid":
            conditions = []
            if container_tag:
                conditions.append(Chunk.container_tag == container_tag)
            if metadata_filter:
                conditions.extend(self._build_metadata_conditions(Chunk, metadata_filter))

            stmt = (select(Chunk, Chunk.embedding.cosine_distance(query_emb).label("dist"))
                    .where(and_(*conditions) if conditions else True)
                    .order_by("dist").limit(limit))
            rows = (await session.execute(stmt)).all()
            for chunk, dist in rows:
                sim = 1.0 - dist
                if sim < threshold:
                    continue
                results.append({
                    "id": str(chunk.id), "chunk": chunk.content,
                    "similarity": round(sim, 4), "container_tag": chunk.container_tag,
                    "created_at": chunk.created_at.isoformat() if chunk.created_at else None,
                    "metadata": chunk.metadata_,
                })

        # Sort by similarity
        results.sort(key=lambda x: x["similarity"], reverse=True)

        # Optional LLM reranking
        if rerank and (org and org.rerank_enabled) and len(results) > 3:
            results = await self._rerank(search_query, results[:limit * 2])

        return results[:limit]

    async def _rerank(self, query: str, results: list[dict]) -> list[dict]:
        """LLM-based reranking for better relevance."""
        results_str = "\n".join(
            f"[{r['id']}] {r.get('memory', r.get('chunk', ''))}" for r in results)
        messages = [
            {"role": "system", "content": RERANK_SYSTEM},
            {"role": "user", "content": RERANK_USER.format(query=query, results=results_str)},
        ]
        try:
            data = await llm_client.chat_json(messages)
            score_map = {s["id"]: s["score"] for s in data.get("scores", [])}
            for r in results:
                if r["id"] in score_map:
                    r["similarity"] = score_map[r["id"]]
            results.sort(key=lambda x: x["similarity"], reverse=True)
        except Exception as e:
            logger.warning("rerank_failed", error=str(e))
        return results

    def _build_metadata_conditions(self, model_cls, filters: dict) -> list:
        """Build SQLAlchemy conditions from metadata filters."""
        conditions = []
        and_filters = filters.get("AND", [])
        for f in and_filters:
            key, val = f.get("key"), f.get("value")
            if key and val is not None:
                negate = f.get("negate", False)
                cond = model_cls.metadata_[key].astext == str(val)
                conditions.append(~cond if negate else cond)
        return conditions

    # ── Search Documents ───────────────────────────────────────────

    async def search_documents(self, session: AsyncSession, query: str,
                               container_tag: str | None = None, limit: int = 10,
                               metadata_filter: dict | None = None) -> list[dict]:
        """Search document chunks."""
        query_emb = await embedding_client.embed_one(query)
        conditions = []
        if container_tag:
            conditions.append(Chunk.container_tag == container_tag)
        stmt = (select(Chunk, Document, Chunk.embedding.cosine_distance(query_emb).label("dist"))
                .join(Document, Chunk.document_id == Document.id)
                .where(and_(*conditions) if conditions else True)
                .order_by("dist").limit(limit))
        rows = (await session.execute(stmt)).all()
        seen = set()
        results = []
        for chunk, doc, dist in rows:
            if str(doc.id) in seen:
                continue
            seen.add(str(doc.id))
            results.append({
                "id": str(doc.id), "content_preview": doc.content[:200],
                "chunk": chunk.content, "similarity": round(1.0 - dist, 4),
                "container_tag": doc.container_tag, "status": doc.status,
                "metadata": doc.metadata_,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            })
        return results

    # ── Profile ────────────────────────────────────────────────────

    async def get_profile(self, session: AsyncSession, container_tag: str,
                          query: str | None = None, limit: int = 10,
                          threshold: float = 0.0) -> dict:
        """Get user profile + optional search."""
        stmt = select(UserProfile).where(UserProfile.container_tag == container_tag)
        profile = (await session.execute(stmt)).scalar_one_or_none()
        if not profile or self._profile_stale(profile):
            await self.rebuild_profile(session, container_tag)
            profile = (await session.execute(stmt)).scalar_one_or_none()

        profile_data = {"static": profile.static_facts if profile else [],
                        "dynamic": profile.dynamic_facts if profile else []}
        search_results = {"results": []}
        if query:
            search_results["results"] = await self.search_memories(
                session, query=query, container_tag=container_tag,
                limit=limit, threshold=threshold)
        return {"profile": profile_data, "searchResults": search_results}

    async def rebuild_profile(self, session: AsyncSession, container_tag: str) -> None:
        """Rebuild profile from all latest memories."""
        stmt = (select(Memory).where(and_(
            Memory.container_tag == container_tag,
            Memory.is_latest == True, Memory.is_forgotten == False))
            .order_by(Memory.created_at.desc()).limit(100))
        memories = (await session.execute(stmt)).scalars().all()
        if not memories:
            return

        memories_str = "\n".join(
            f"[{m.memory_type}{'|static' if m.is_static else ''}] {m.content} "
            f"(created: {m.created_at.isoformat() if m.created_at else 'unknown'})"
            for m in memories)

        messages = [
            {"role": "system", "content": BUILD_PROFILE_SYSTEM},
            {"role": "user", "content": BUILD_PROFILE_USER.format(memories=memories_str)},
        ]
        profile_data = await llm_client.chat_json(messages)

        stmt = select(UserProfile).where(UserProfile.container_tag == container_tag)
        profile = (await session.execute(stmt)).scalar_one_or_none()
        if profile:
            profile.static_facts = profile_data.get("static", [])
            profile.dynamic_facts = profile_data.get("dynamic", [])
            profile.last_rebuilt_at = datetime.now(timezone.utc)
        else:
            session.add(UserProfile(
                container_tag=container_tag,
                static_facts=profile_data.get("static", []),
                dynamic_facts=profile_data.get("dynamic", []),
                last_rebuilt_at=datetime.now(timezone.utc)))
        logger.info("profile_rebuilt", container_tag=container_tag)

    def _profile_stale(self, p: UserProfile) -> bool:
        if not p.last_rebuilt_at:
            return True
        return (datetime.now(timezone.utc) - p.last_rebuilt_at).total_seconds() > 3600

    # ── Direct Memory Operations ───────────────────────────────────

    async def create_memory_direct(self, session: AsyncSession, content: str,
                                   container_tag: str | None = None,
                                   memory_type: str = "fact", is_static: bool = False,
                                   metadata: dict | None = None) -> Memory:
        """Create memory directly (bypass document pipeline)."""
        emb = await embedding_client.embed_one(content)
        mem = Memory(content=content, container_tag=container_tag,
                     memory_type=memory_type, is_static=is_static,
                     embedding=emb, metadata_=metadata)
        session.add(mem)
        await session.flush()
        return mem

    async def create_memories_batch(self, session: AsyncSession,
                                    memories: list[dict],
                                    container_tag: str) -> list[Memory]:
        """Batch create memories directly."""
        texts = [m["content"] for m in memories]
        embeddings = await embedding_client.embed(texts)
        result = []
        for mdata, emb in zip(memories, embeddings):
            mem = Memory(
                content=mdata["content"], container_tag=container_tag,
                memory_type=mdata.get("type", "fact"),
                is_static=mdata.get("is_static", mdata.get("isStatic", False)),
                embedding=emb, metadata_=mdata.get("metadata"))
            session.add(mem)
            result.append(mem)
        await session.flush()
        return result

    async def forget_memory(self, session: AsyncSession, memory_id: uuid.UUID) -> bool:
        mem = await session.get(Memory, memory_id)
        if not mem:
            return False
        mem.is_forgotten = True
        mem.forgotten_at = datetime.now(timezone.utc)
        return True

    async def update_memory(self, session: AsyncSession, memory_id: uuid.UUID,
                            new_content: str) -> Memory | None:
        old = await session.get(Memory, memory_id)
        if not old:
            return None
        emb = await embedding_client.embed_one(new_content)
        new = Memory(document_id=old.document_id, container_tag=old.container_tag,
                     content=new_content, memory_type=old.memory_type,
                     is_static=old.is_static, embedding=emb,
                     metadata_=old.metadata_, version=old.version + 1)
        session.add(new)
        await session.flush()
        session.add(MemoryEdge(source_id=new.id, target_id=old.id,
                               relation_type="updates", confidence=1.0))
        old.is_latest = False
        return new

    # ── Decay ──────────────────────────────────────────────────────

    async def run_decay_check(self, session: AsyncSession) -> int:
        now = datetime.now(timezone.utc)
        stmt = select(Memory).where(and_(
            Memory.is_forgotten == False, Memory.expires_at.isnot(None), Memory.expires_at < now))
        expired = (await session.execute(stmt)).scalars().all()
        for mem in expired:
            mem.is_forgotten = True
            mem.forgotten_at = now
        if expired:
            logger.info("decay_check", forgotten=len(expired))
        return len(expired)

    # ── Settings Helpers ───────────────────────────────────────────

    async def _get_org_settings(self, session: AsyncSession) -> OrgSettings | None:
        return (await session.execute(select(OrgSettings).limit(1))).scalar_one_or_none()

    async def _get_container_settings(self, session: AsyncSession,
                                      container_tag: str | None) -> ContainerSettings | None:
        if not container_tag:
            return None
        return (await session.execute(
            select(ContainerSettings).where(ContainerSettings.container_tag == container_tag)
        )).scalar_one_or_none()


# Singleton
memory_engine = MemoryEngine()


def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        return None
