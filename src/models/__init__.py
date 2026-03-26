"""SQLAlchemy models for MemoClaw — supermemory-compatible schema."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Text, DateTime, Boolean, Integer, Float,
    ForeignKey, Index, JSON,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import DeclarativeBase, relationship
from pgvector.sqlalchemy import Vector

from src.config import settings


class Base(DeclarativeBase):
    pass


# ── Documents ──────────────────────────────────────────────────────

class Document(Base):
    """Raw input: text, URLs, conversations. Processed into memories + chunks."""

    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content = Column(Text, nullable=False)
    container_tag = Column(String(100), nullable=True, index=True)
    custom_id = Column(String(100), nullable=True, index=True)
    metadata_ = Column("metadata", JSONB, nullable=True, default=dict)
    entity_context = Column(String(1500), nullable=True)

    # Content hash for diff-based updates (like supermemory customId diffing)
    content_hash = Column(String(64), nullable=True)
    previous_content = Column(Text, nullable=True)  # Stored for diff detection

    status = Column(String(20), nullable=False, default="queued")
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    memories = relationship("Memory", back_populates="document", cascade="all, delete-orphan")
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_documents_container_status", "container_tag", "status"),
        Index("ix_documents_custom_id_container", "custom_id", "container_tag"),
    )


# ── Chunks (RAG layer) ────────────────────────────────────────────

class Chunk(Base):
    """Document chunks for RAG retrieval — raw content pieces with embeddings."""

    __tablename__ = "chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    container_tag = Column(String(100), nullable=True, index=True)

    content = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False, default=0)
    embedding = Column(Vector(settings.embedding_dimensions), nullable=True)

    metadata_ = Column("metadata", JSONB, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    document = relationship("Document", back_populates="chunks")

    __table_args__ = (
        Index("ix_chunks_container", "container_tag"),
    )


# ── Memories (extracted facts) ─────────────────────────────────────

class Memory(Base):
    """Extracted knowledge units — facts, preferences, episodes."""

    __tablename__ = "memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    container_tag = Column(String(100), nullable=True, index=True)

    content = Column(Text, nullable=False)
    memory_type = Column(String(20), nullable=False, default="fact")  # fact, preference, episode
    embedding = Column(Vector(settings.embedding_dimensions), nullable=True)

    # Supermemory-style isStatic: true = permanent identity trait, false = dynamic/temporal
    is_static = Column(Boolean, default=False)
    is_latest = Column(Boolean, default=True, index=True)
    is_forgotten = Column(Boolean, default=False, index=True)
    forgotten_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, default=1)

    # Temporal awareness
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Metadata
    metadata_ = Column("metadata", JSONB, nullable=True, default=dict)
    source_chunk_index = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    document = relationship("Document", back_populates="memories")
    outgoing_edges = relationship("MemoryEdge", foreign_keys="MemoryEdge.source_id", back_populates="source")
    incoming_edges = relationship("MemoryEdge", foreign_keys="MemoryEdge.target_id", back_populates="target")

    __table_args__ = (
        Index("ix_memories_container_latest", "container_tag", "is_latest"),
        Index("ix_memories_container_forgotten", "container_tag", "is_forgotten"),
        Index("ix_memories_container_static", "container_tag", "is_static"),
    )


# ── Memory Edges ───────────────────────────────────────────────────

class MemoryEdge(Base):
    """Relationships: updates, extends, derives."""

    __tablename__ = "memory_edges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("memories.id"), nullable=False, index=True)
    target_id = Column(UUID(as_uuid=True), ForeignKey("memories.id"), nullable=False, index=True)
    relation_type = Column(String(20), nullable=False)
    confidence = Column(Float, nullable=True, default=1.0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    source = relationship("Memory", foreign_keys=[source_id], back_populates="outgoing_edges")
    target = relationship("Memory", foreign_keys=[target_id], back_populates="incoming_edges")


# ── User Profiles ──────────────────────────────────────────────────

class UserProfile(Base):
    """Cached user profiles built from memories."""

    __tablename__ = "user_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    container_tag = Column(String(100), nullable=False, unique=True, index=True)

    static_facts = Column(ARRAY(Text), nullable=False, default=list)
    dynamic_facts = Column(ARRAY(Text), nullable=False, default=list)

    last_rebuilt_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


# ── Container Settings ─────────────────────────────────────────────

class ContainerSettings(Base):
    """Per-container configuration — entity context, filter prompts."""

    __tablename__ = "container_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    container_tag = Column(String(100), nullable=False, unique=True, index=True)

    entity_context = Column(String(1500), nullable=True)  # Persisted per-container context
    filter_prompt = Column(Text, nullable=True)  # Container-level extraction guidance
    chunk_size = Column(Integer, nullable=True, default=None)  # Override default chunk size

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


# ── Org Settings ───────────────────────────────────────────────────

class OrgSettings(Base):
    """Global settings — filter prompts, chunk size, etc."""

    __tablename__ = "org_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filter_prompt = Column(Text, nullable=True)  # Org-wide LLM filter instructions
    should_llm_filter = Column(Boolean, default=False)
    default_chunk_size = Column(Integer, default=512)
    rerank_enabled = Column(Boolean, default=False)

    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


# ── Web Users ──────────────────────────────────────────────────────

class WebUser(Base):
    """Web UI user accounts."""

    __tablename__ = "web_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
