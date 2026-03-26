"""Core memory engine — extraction, relation detection, search, and profiles."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func, and_, or_, text, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models import Document, Memory, MemoryEdge, UserProfile
from src.llm import llm_client, embedding_client
from src.llm.prompts import (
    EXTRACT_MEMORIES_SYSTEM,
    EXTRACT_MEMORIES_USER,
    DETECT_RELATIONS_SYSTEM,
    DETECT_RELATIONS_USER,
    BUILD_PROFILE_SYSTEM,
    BUILD_PROFILE_USER,
)

logger = structlog.get_logger()


class MemoryEngine:
    """Orchestrates memory extraction, graph relationships, search, and profile building."""

    # ── Document Processing ────────────────────────────────────────

    async def process_document(self, session: AsyncSession, doc_id: uuid.UUID) -> None:
        """Full pipeline: extract memories, embed, detect relations, update profile."""
        doc = await session.get(Document, doc_id)
        if not doc:
            logger.error("document_not_found", doc_id=str(doc_id))
            return

        try:
            # Stage: extracting
            doc.status = "extracting"
            await session.flush()

            memories_data = await self._extract_memories(doc.content, doc.entity_context)

            # Stage: embedding
            doc.status = "embedding"
            await session.flush()

            if not memories_data:
                doc.status = "done"
                return

            texts = [m["content"] for m in memories_data]
            embeddings = await embedding_client.embed(texts)

            # Stage: indexing (create Memory objects)
            doc.status = "indexing"
            await session.flush()

            new_memories = []
            for i, (mdata, emb) in enumerate(zip(memories_data, embeddings)):
                mem = Memory(
                    document_id=doc.id,
                    container_tag=doc.container_tag,
                    content=mdata["content"],
                    memory_type=mdata.get("type", "fact"),
                    embedding=emb,
                    expires_at=_parse_datetime(mdata.get("expires_at")),
                    source_chunk_index=i,
                    metadata_=doc.metadata_,
                )
                session.add(mem)
                new_memories.append(mem)

            await session.flush()

            # Detect relations with existing memories
            await self._detect_relations(session, new_memories)

            doc.status = "done"
            logger.info(
                "document_processed",
                doc_id=str(doc.id),
                memories_created=len(new_memories),
            )

            # Rebuild profile asynchronously (best-effort)
            if doc.container_tag:
                try:
                    await self.rebuild_profile(session, doc.container_tag)
                except Exception as e:
                    logger.warning("profile_rebuild_failed", error=str(e))

        except Exception as e:
            doc.status = "error"
            doc.error_message = str(e)[:500]
            logger.error("document_processing_failed", doc_id=str(doc_id), error=str(e))
            raise

    async def _extract_memories(
        self, content: str, entity_context: str | None = None
    ) -> list[dict]:
        """Use LLM to extract atomic memories from content."""
        messages = [
            {"role": "system", "content": EXTRACT_MEMORIES_SYSTEM},
            {
                "role": "user",
                "content": EXTRACT_MEMORIES_USER.format(
                    content=content[:8000],  # Truncate very long content
                    entity_context=entity_context or "No additional context",
                ),
            },
        ]
        result = await llm_client.chat_json(messages)
        memories = result.get("memories", [])
        logger.debug("memories_extracted", count=len(memories))
        return memories

    async def _detect_relations(
        self, session: AsyncSession, new_memories: list[Memory]
    ) -> None:
        """Detect relationships between new and existing memories."""
        for mem in new_memories:
            if not mem.container_tag:
                continue

            # Get existing memories in the same container (excluding current batch)
            new_ids = [m.id for m in new_memories]
            stmt = (
                select(Memory)
                .where(
                    and_(
                        Memory.container_tag == mem.container_tag,
                        Memory.is_latest == True,
                        Memory.is_forgotten == False,
                        ~Memory.id.in_(new_ids),
                    )
                )
                .order_by(Memory.created_at.desc())
                .limit(50)
            )
            result = await session.execute(stmt)
            existing = result.scalars().all()

            if not existing:
                continue

            existing_str = "\n".join(
                f"[{str(m.id)}] {m.content}" for m in existing
            )

            messages = [
                {"role": "system", "content": DETECT_RELATIONS_SYSTEM},
                {
                    "role": "user",
                    "content": DETECT_RELATIONS_USER.format(
                        new_memory=mem.content,
                        existing_memories=existing_str,
                    ),
                },
            ]

            try:
                result_data = await llm_client.chat_json(messages)
                relations = result_data.get("relations", [])

                for rel in relations:
                    existing_id = rel.get("existing_memory_id")
                    if not existing_id:
                        continue

                    # Validate the ID exists
                    existing_ids = {str(m.id) for m in existing}
                    if existing_id not in existing_ids:
                        continue

                    edge = MemoryEdge(
                        source_id=mem.id,
                        target_id=uuid.UUID(existing_id),
                        relation_type=rel["relation_type"],
                        confidence=rel.get("confidence", 1.0),
                    )
                    session.add(edge)

                    # If this updates an existing memory, mark old one as not latest
                    if rel["relation_type"] == "updates":
                        old_mem = await session.get(Memory, uuid.UUID(existing_id))
                        if old_mem:
                            old_mem.is_latest = False

                logger.debug(
                    "relations_detected",
                    memory_id=str(mem.id),
                    relations=len(relations),
                )
            except Exception as e:
                logger.warning(
                    "relation_detection_failed",
                    memory_id=str(mem.id),
                    error=str(e),
                )

    # ── Search ─────────────────────────────────────────────────────

    async def search_memories(
        self,
        session: AsyncSession,
        query: str,
        container_tag: str | None = None,
        limit: int = 10,
        threshold: float = 0.0,
        search_mode: str = "hybrid",  # hybrid, memories, documents
        metadata_filter: dict | None = None,
    ) -> list[dict]:
        """Hybrid search: semantic similarity + full-text + graph-aware ranking."""
        query_embedding = await embedding_client.embed_one(query)

        # Base conditions
        conditions = [
            Memory.is_forgotten == False,
        ]
        if search_mode == "memories":
            conditions.append(Memory.is_latest == True)
        if container_tag:
            conditions.append(Memory.container_tag == container_tag)

        # Vector similarity search
        stmt = (
            select(
                Memory,
                Memory.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .where(and_(*conditions))
            .order_by("distance")
            .limit(limit * 2)  # Fetch more for reranking
        )

        result = await session.execute(stmt)
        rows = result.all()

        # Score and format results
        results = []
        for mem, distance in rows:
            similarity = 1.0 - distance
            if similarity < threshold:
                continue

            results.append(
                {
                    "id": str(mem.id),
                    "memory": mem.content,
                    "type": mem.memory_type,
                    "similarity": round(similarity, 4),
                    "is_latest": mem.is_latest,
                    "container_tag": mem.container_tag,
                    "created_at": mem.created_at.isoformat() if mem.created_at else None,
                    "metadata": mem.metadata_,
                }
            )

        # Sort by similarity and limit
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:limit]

    async def search_documents(
        self,
        session: AsyncSession,
        query: str,
        container_tag: str | None = None,
        limit: int = 10,
        metadata_filter: dict | None = None,
    ) -> list[dict]:
        """Search documents by content similarity."""
        query_embedding = await embedding_client.embed_one(query)

        conditions = [
            Memory.is_forgotten == False,
            Memory.document_id.isnot(None),
        ]
        if container_tag:
            conditions.append(Memory.container_tag == container_tag)

        stmt = (
            select(
                Memory,
                Document,
                Memory.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .join(Document, Memory.document_id == Document.id)
            .where(and_(*conditions))
            .order_by("distance")
            .limit(limit)
        )

        result = await session.execute(stmt)
        rows = result.all()

        results = []
        seen_docs = set()
        for mem, doc, distance in rows:
            if str(doc.id) in seen_docs:
                continue
            seen_docs.add(str(doc.id))
            similarity = 1.0 - distance

            results.append(
                {
                    "id": str(doc.id),
                    "content_preview": doc.content[:200],
                    "similarity": round(similarity, 4),
                    "container_tag": doc.container_tag,
                    "status": doc.status,
                    "metadata": doc.metadata_,
                    "created_at": doc.created_at.isoformat() if doc.created_at else None,
                }
            )

        return results

    # ── Profile ────────────────────────────────────────────────────

    async def get_profile(
        self,
        session: AsyncSession,
        container_tag: str,
        query: str | None = None,
        limit: int = 10,
        threshold: float = 0.0,
    ) -> dict:
        """Get user profile + optional search results."""
        # Get or rebuild profile
        stmt = select(UserProfile).where(UserProfile.container_tag == container_tag)
        result = await session.execute(stmt)
        profile = result.scalar_one_or_none()

        if not profile or self._profile_stale(profile):
            await self.rebuild_profile(session, container_tag)
            result = await session.execute(stmt)
            profile = result.scalar_one_or_none()

        profile_data = {
            "static": profile.static_facts if profile else [],
            "dynamic": profile.dynamic_facts if profile else [],
        }

        # Optional search
        search_results = {"results": []}
        if query:
            memories = await self.search_memories(
                session,
                query=query,
                container_tag=container_tag,
                limit=limit,
                threshold=threshold,
            )
            search_results = {"results": memories}

        return {
            "profile": profile_data,
            "searchResults": search_results,
        }

    async def rebuild_profile(self, session: AsyncSession, container_tag: str) -> None:
        """Rebuild user profile from all memories in a container."""
        stmt = (
            select(Memory)
            .where(
                and_(
                    Memory.container_tag == container_tag,
                    Memory.is_latest == True,
                    Memory.is_forgotten == False,
                )
            )
            .order_by(Memory.created_at.desc())
            .limit(100)
        )
        result = await session.execute(stmt)
        memories = result.scalars().all()

        if not memories:
            return

        memories_str = "\n".join(
            f"[{m.memory_type}] {m.content} (created: {m.created_at.isoformat() if m.created_at else 'unknown'})"
            for m in memories
        )

        messages = [
            {"role": "system", "content": BUILD_PROFILE_SYSTEM},
            {
                "role": "user",
                "content": BUILD_PROFILE_USER.format(memories=memories_str),
            },
        ]

        profile_data = await llm_client.chat_json(messages)

        # Upsert profile
        stmt = select(UserProfile).where(UserProfile.container_tag == container_tag)
        result = await session.execute(stmt)
        profile = result.scalar_one_or_none()

        if profile:
            profile.static_facts = profile_data.get("static", [])
            profile.dynamic_facts = profile_data.get("dynamic", [])
            profile.last_rebuilt_at = datetime.now(timezone.utc)
        else:
            profile = UserProfile(
                container_tag=container_tag,
                static_facts=profile_data.get("static", []),
                dynamic_facts=profile_data.get("dynamic", []),
                last_rebuilt_at=datetime.now(timezone.utc),
            )
            session.add(profile)

        logger.info(
            "profile_rebuilt",
            container_tag=container_tag,
            static=len(profile.static_facts),
            dynamic=len(profile.dynamic_facts),
        )

    def _profile_stale(self, profile: UserProfile) -> bool:
        """Check if profile needs rebuilding (older than 1 hour)."""
        if not profile.last_rebuilt_at:
            return True
        age = (datetime.now(timezone.utc) - profile.last_rebuilt_at).total_seconds()
        return age > 3600

    # ── Direct Memory Operations ───────────────────────────────────

    async def create_memory_direct(
        self,
        session: AsyncSession,
        content: str,
        container_tag: str | None = None,
        memory_type: str = "fact",
        metadata: dict | None = None,
    ) -> Memory:
        """Create a memory directly (bypassing document ingestion)."""
        embedding = await embedding_client.embed_one(content)

        mem = Memory(
            content=content,
            container_tag=container_tag,
            memory_type=memory_type,
            embedding=embedding,
            metadata_=metadata,
        )
        session.add(mem)
        await session.flush()

        logger.info("memory_created_direct", memory_id=str(mem.id))
        return mem

    async def forget_memory(self, session: AsyncSession, memory_id: uuid.UUID) -> bool:
        """Soft-delete a memory."""
        mem = await session.get(Memory, memory_id)
        if not mem:
            return False

        mem.is_forgotten = True
        mem.forgotten_at = datetime.now(timezone.utc)
        logger.info("memory_forgotten", memory_id=str(memory_id))
        return True

    async def update_memory(
        self, session: AsyncSession, memory_id: uuid.UUID, new_content: str
    ) -> Memory | None:
        """Update a memory by creating a new version."""
        old_mem = await session.get(Memory, memory_id)
        if not old_mem:
            return None

        embedding = await embedding_client.embed_one(new_content)

        new_mem = Memory(
            document_id=old_mem.document_id,
            container_tag=old_mem.container_tag,
            content=new_content,
            memory_type=old_mem.memory_type,
            embedding=embedding,
            metadata_=old_mem.metadata_,
        )
        session.add(new_mem)
        await session.flush()

        # Create update edge
        edge = MemoryEdge(
            source_id=new_mem.id,
            target_id=old_mem.id,
            relation_type="updates",
            confidence=1.0,
        )
        session.add(edge)

        # Mark old as not latest
        old_mem.is_latest = False

        logger.info(
            "memory_updated",
            old_id=str(memory_id),
            new_id=str(new_mem.id),
        )
        return new_mem

    # ── Decay / Forgetting Worker ──────────────────────────────────

    async def run_decay_check(self, session: AsyncSession) -> int:
        """Check and forget expired memories. Returns count of forgotten memories."""
        now = datetime.now(timezone.utc)

        stmt = (
            select(Memory)
            .where(
                and_(
                    Memory.is_forgotten == False,
                    Memory.expires_at.isnot(None),
                    Memory.expires_at < now,
                )
            )
        )
        result = await session.execute(stmt)
        expired = result.scalars().all()

        count = 0
        for mem in expired:
            mem.is_forgotten = True
            mem.forgotten_at = now
            count += 1

        if count:
            logger.info("decay_check_complete", forgotten=count)
        return count


# Singleton
memory_engine = MemoryEngine()


def _parse_datetime(val: str | None) -> datetime | None:
    """Parse ISO datetime string, return None on failure."""
    if not val:
        return None
    try:
        from python_dateutil.parser import parse as dateparse
        return dateparse(val)
    except Exception:
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            return None
