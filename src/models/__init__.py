"""SQLAlchemy models for MemoClaw."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    Boolean,
    Integer,
    Float,
    ForeignKey,
    Index,
    JSON,
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import DeclarativeBase, relationship
from pgvector.sqlalchemy import Vector

from src.config import settings


class Base(DeclarativeBase):
    pass


class Document(Base):
    """Raw input documents (text, URLs, conversations)."""

    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content = Column(Text, nullable=False)
    container_tag = Column(String(100), nullable=True, index=True)
    custom_id = Column(String(100), nullable=True, index=True)
    metadata_ = Column("metadata", JSONB, nullable=True, default=dict)
    entity_context = Column(String(1500), nullable=True)

    status = Column(
        String(20), nullable=False, default="queued"
    )  # queued, extracting, chunking, embedding, indexing, done, error
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    memories = relationship("Memory", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_documents_container_status", "container_tag", "status"),
    )


class Memory(Base):
    """Extracted knowledge units with embeddings."""

    __tablename__ = "memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    container_tag = Column(String(100), nullable=True, index=True)

    content = Column(Text, nullable=False)
    memory_type = Column(
        String(20), nullable=False, default="fact"
    )  # fact, preference, episode
    embedding = Column(Vector(settings.embedding_dimensions), nullable=True)

    is_latest = Column(Boolean, default=True, index=True)
    is_forgotten = Column(Boolean, default=False, index=True)
    forgotten_at = Column(DateTime(timezone=True), nullable=True)

    # Temporal awareness
    expires_at = Column(DateTime(timezone=True), nullable=True)
    decay_rate = Column(Float, nullable=True)  # 0.0 = permanent, 1.0 = fast decay

    # Metadata
    metadata_ = Column("metadata", JSONB, nullable=True, default=dict)
    source_chunk_index = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    document = relationship("Document", back_populates="memories")
    # Edges where this memory is the source
    outgoing_edges = relationship(
        "MemoryEdge", foreign_keys="MemoryEdge.source_id", back_populates="source"
    )
    # Edges where this memory is the target
    incoming_edges = relationship(
        "MemoryEdge", foreign_keys="MemoryEdge.target_id", back_populates="target"
    )

    __table_args__ = (
        Index("ix_memories_container_latest", "container_tag", "is_latest"),
        Index("ix_memories_container_forgotten", "container_tag", "is_forgotten"),
    )


class MemoryEdge(Base):
    """Relationships between memories (updates, extends, derives)."""

    __tablename__ = "memory_edges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("memories.id"), nullable=False, index=True)
    target_id = Column(UUID(as_uuid=True), ForeignKey("memories.id"), nullable=False, index=True)
    relation_type = Column(
        String(20), nullable=False
    )  # updates, extends, derives
    confidence = Column(Float, nullable=True, default=1.0)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    source = relationship("Memory", foreign_keys=[source_id], back_populates="outgoing_edges")
    target = relationship("Memory", foreign_keys=[target_id], back_populates="incoming_edges")


class UserProfile(Base):
    """Cached user profiles built from memories."""

    __tablename__ = "user_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    container_tag = Column(String(100), nullable=False, unique=True, index=True)

    static_facts = Column(ARRAY(Text), nullable=False, default=list)  # Long-term stable facts
    dynamic_facts = Column(ARRAY(Text), nullable=False, default=list)  # Recent/temporary context

    last_rebuilt_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
