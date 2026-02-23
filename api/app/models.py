from __future__ import annotations

from datetime import date as _date
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, TSVECTOR
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Domain models (org / user / membership)
# ---------------------------------------------------------------------------

class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    projects: Mapped[list["Project"]] = relationship(back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Membership(Base):
    __tablename__ = "memberships"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    memories: Mapped[list["Memory"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    tags: Mapped[list["Tag"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    organization: Mapped[Organization] = relationship(back_populates="projects")


# ---------------------------------------------------------------------------
# Memories + tags
# ---------------------------------------------------------------------------

class Memory(Base):
    __tablename__ = "memories"
    __table_args__ = (
        Index("ix_memories_project_hilbert_index", "project_id", "hilbert_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # What kind of memory: decision, finding, definition, note, link, todo, chat, doc, code, etc.
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Where it came from: manual, chatgpt, claude, cursor, codex, api, extension, etc.
    source: Mapped[str] = mapped_column(String(100), nullable=False, server_default=text("'manual'"))
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Flexible structured metadata: url, file_path, language, model, tool, thread_id, commit_sha, etc.
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    # SHA-256 of content for deduplication
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Embedding payload (JSON float array fallback until pgvector rollout).
    search_vector: Mapped[list[float] | None] = mapped_column(JSONB, nullable=True)
    # Native pgvector embedding for cosine similarity search.
    embedding_vector: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)
    # 1D locality-preserving key derived from embeddings for coarse pre-filtering.
    hilbert_index: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    # FTS vector — maintained by trig_memories_tsv trigger in the DB
    search_tsv: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    project: Mapped[Project] = relationship(back_populates="memories")
    memory_tags: Mapped[list["MemoryTag"]] = relationship(
        back_populates="memory", cascade="all, delete-orphan"
    )


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_tags_project_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="tags")
    memory_tags: Mapped[list["MemoryTag"]] = relationship(back_populates="tag")


class MemoryTag(Base):
    __tablename__ = "memory_tags"
    __table_args__ = (UniqueConstraint("memory_id", "tag_id", name="uq_memory_tags"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    memory_id: Mapped[int] = mapped_column(
        ForeignKey("memories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True
    )

    memory: Mapped[Memory] = relationship(back_populates="memory_tags")
    tag: Mapped[Tag] = relationship(back_populates="memory_tags")


# ---------------------------------------------------------------------------
# Memory embeddings placeholder (pgvector drops in later)
# ---------------------------------------------------------------------------

class MemoryEmbedding(Base):
    """Placeholder table for future vector embeddings.

    When pgvector is ready:
      ALTER TABLE memory_embeddings ADD COLUMN embedding vector(1536);
      CREATE INDEX ON memory_embeddings USING ivfflat (embedding vector_cosine_ops);
    """
    __tablename__ = "memory_embeddings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    memory_id: Mapped[int] = mapped_column(
        ForeignKey("memories.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    confidence: Mapped[float | None] = mapped_column(nullable=True)
    dims: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# API keys + audit
# ---------------------------------------------------------------------------

class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    api_key_prefix: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[int] = mapped_column(nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecallLog(Base):
    __tablename__ = "recall_logs"
    __table_args__ = (
        Index("ix_recall_logs_org_created", "org_id", "created_at"),
        Index("ix_recall_logs_project_created", "project_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    strategy: Mapped[str] = mapped_column(String(32), nullable=False)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    input_memory_ids: Mapped[list[int]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    ranked_memory_ids: Mapped[list[int]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    weights_json: Mapped[dict[str, Any]] = mapped_column(
        "weights",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    score_details_json: Mapped[dict[str, Any]] = mapped_column(
        "score_details",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecallTiming(Base):
    __tablename__ = "recall_timings"
    __table_args__ = (
        Index("ix_recall_timings_org_created", "org_id", "created_at"),
        Index("ix_recall_timings_served_by_created", "served_by", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    served_by: Mapped[str] = mapped_column(String(16), nullable=False)
    strategy: Mapped[str] = mapped_column(String(32), nullable=False)
    hedge_delay_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    cag_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rag_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Auth models
# ---------------------------------------------------------------------------

class AuthUser(Base):
    __tablename__ = "auth_users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # When true, all daily usage limits are bypassed for this user (e.g. admins, beta testers)
    is_unlimited: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    invite_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class AuthMagicLink(Base):
    __tablename__ = "auth_magic_links"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    request_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'login'"))
    send_status: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'logged'"))


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("auth_users.id", ondelete="CASCADE"), index=True)
    session_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    device_label: Mapped[str | None] = mapped_column(String(255), nullable=True)


class AuthInvite(Base):
    __tablename__ = "auth_invites"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    invited_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("auth_users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Login event tracking (last 10 per user, retention enforced at insert time)
# ---------------------------------------------------------------------------

class AuthLoginEvent(Base):
    """Stores the last 10 successful login IPs per user.

    Retention is enforced transactionally inside the verify_link endpoint:
    after each insert the oldest rows beyond the 10-entry window are deleted
    in the same DB transaction, so concurrency is safe without a cron job.
    """
    __tablename__ = "auth_login_events"
    __table_args__ = (
        Index("ix_auth_login_events_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Stored as PostgreSQL INET for proper IP semantics; asyncpg returns it as a string
    ip: Mapped[str] = mapped_column(INET, nullable=False)
    # Store a short UA string (first 512 chars) — never store raw tokens or secrets
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


# ---------------------------------------------------------------------------
# Waitlist
# ---------------------------------------------------------------------------

class Waitlist(Base):
    """Stores emails of visitors who requested alpha access but are not yet invited."""
    __tablename__ = "waitlist"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'pending'"), index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True, index=True
    )


# ---------------------------------------------------------------------------
# Usage tracking
# ---------------------------------------------------------------------------

class UsageEvent(Base):
    """Raw usage event log — one row per action."""
    __tablename__ = "usage_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("auth_users.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    ip_prefix: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_agent_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    org_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)


class UsageCounter(Base):
    """Daily per-user usage counters for live limit enforcement.

    One row per (user_id, day).  Updated atomically via ON CONFLICT DO UPDATE
    inside each create/recall operation.  Rows are never deleted automatically
    so they form a lightweight audit trail.
    """
    __tablename__ = "usage_counters"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_usage_counters_user_day"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[_date] = mapped_column(Date, nullable=False, index=True)
    memories_created: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    recall_queries: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    projects_created: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))


# ---------------------------------------------------------------------------
# Refinery pipeline — raw captures & inbox drafts
# ---------------------------------------------------------------------------

class RawCapture(Base):
    """Raw data submitted by a client (CLI, Chrome extension, MCP, email).

    The worker reads this row, runs LLM extraction, and writes InboxItem
    drafts.  Once processing is complete, processed_at is set.
    """
    __tablename__ = "raw_captures"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    # Optional project hint supplied by the caller.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Where this payload came from.
    # Allowed values: chrome_ext | cli | mcp | email
    source: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Raw payload — chat log, DOM dump, terminal history, email body, etc.
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    # Set by the worker once LLM extraction is complete.
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    inbox_items: Mapped[list["InboxItem"]] = relationship(
        back_populates="raw_capture", cascade="all, delete-orphan"
    )


class InboxItem(Base):
    """LLM-suggested memory draft awaiting human triage.

    Created by the Refinery worker from a RawCapture.
    On approval, the item is promoted to a real Memory via the standard
    creation flow (embedding, FTS, Hilbert index all computed).
    """
    __tablename__ = "inbox_items"
    __table_args__ = (
        Index("ix_inbox_items_project_status", "project_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    raw_capture_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_captures.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Promoted memory FK — set on approval.
    promoted_memory_id: Mapped[int | None] = mapped_column(
        ForeignKey("memories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # LLM-suggested fields — editable before approval.
    suggested_type: Mapped[str] = mapped_column(String(50), nullable=False)
    suggested_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    suggested_content: Mapped[str] = mapped_column(Text, nullable=False)
    # How confident the LLM was (0.0–1.0).
    confidence_score: Mapped[float] = mapped_column(nullable=False, server_default=text("0.8"))
    # Lifecycle: pending | approved | rejected | merged
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    raw_capture: Mapped["RawCapture | None"] = relationship(back_populates="inbox_items")


class UsagePeriod(Base):
    """Aggregated per-user monthly usage counters for limit enforcement."""
    __tablename__ = "usage_periods"
    __table_args__ = (UniqueConstraint("user_id", "period_start", name="uq_usage_periods_user_period"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # First day of the month (UTC), e.g. 2026-02-01
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    # Last instant of the month
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    memories_created: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    search_queries: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    # Rough byte estimate for ingested content
    bytes_ingested: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
