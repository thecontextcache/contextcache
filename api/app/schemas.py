from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

MemoryType = Literal["decision", "finding", "definition", "note", "link", "todo", "chat", "doc", "code", "file", "web", "event"]
MemorySource = Literal["manual", "chatgpt", "claude", "cursor", "codex", "api", "extension"]
RoleType = Literal["owner", "admin", "member", "viewer"]
WaitlistStatus = Literal["pending", "approved", "rejected"]


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ProjectOut(BaseModel):
    id: int
    org_id: int
    created_by_user_id: int | None = None
    name: str
    created_at: datetime
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------

class TagOut(BaseModel):
    id: int
    name: str


# ---------------------------------------------------------------------------
# Memories
# ---------------------------------------------------------------------------

class MemoryCreate(BaseModel):
    type: MemoryType
    source: MemorySource = "manual"
    title: Optional[str] = Field(default=None, max_length=500)
    content: str = Field(min_length=1)
    # Flexible metadata: url, file_path, language, model, tool, thread_id, commit_sha, role, etc.
    metadata: Dict[str, Any] = Field(default_factory=dict)
    # Comma-separated or pre-split tag names — max 20 tags, each max 100 chars
    tags: List[str] = Field(default_factory=list)


class MemoryOut(BaseModel):
    id: int
    project_id: int
    created_by_user_id: int | None = None
    type: str
    source: str
    title: str | None = None
    content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime | None = None


class RecallItemOut(MemoryOut):
    rank_score: float | None = None


class RecallOut(BaseModel):
    project_id: int
    query: str
    memory_pack_text: str
    items: List[RecallItemOut]


class SearchOut(BaseModel):
    project_id: int
    query: str
    total: int
    items: List[RecallItemOut]


# ---------------------------------------------------------------------------
# Orgs
# ---------------------------------------------------------------------------

class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class OrgOut(BaseModel):
    id: int
    name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------

class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ApiKeyOut(BaseModel):
    id: int
    org_id: int
    name: str
    prefix: str
    created_at: datetime
    revoked_at: datetime | None = None


class ApiKeyCreatedOut(ApiKeyOut):
    api_key: str


# ---------------------------------------------------------------------------
# Memberships
# ---------------------------------------------------------------------------

class MeOut(BaseModel):
    org_id: int | None = None
    role: RoleType | None = None
    api_key_prefix: str | None = None
    actor_user_id: int | None = None


class MembershipCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    role: RoleType


class MembershipOut(BaseModel):
    id: int
    org_id: int
    user_id: int
    email: str
    display_name: str | None = None
    role: RoleType
    created_at: datetime


# ---------------------------------------------------------------------------
# Audit logs
# ---------------------------------------------------------------------------

class AuditLogOut(BaseModel):
    id: int
    org_id: int
    actor_user_id: int | None = None
    api_key_prefix: str | None = None
    action: str
    entity_type: str
    entity_id: int
    metadata: dict
    created_at: datetime


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class AuthRequestLinkIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class AuthRequestLinkOut(BaseModel):
    status: str
    detail: str
    debug_link: str | None = None


class AuthMeOut(BaseModel):
    email: str
    is_admin: bool
    created_at: datetime
    last_login_at: datetime | None = None


# ---------------------------------------------------------------------------
# Admin — invites
# ---------------------------------------------------------------------------

class AdminInviteCreateIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


class AdminInviteOut(BaseModel):
    id: int
    email: str
    invited_by_user_id: int | None = None
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    notes: str | None = None


# ---------------------------------------------------------------------------
# Admin — users
# ---------------------------------------------------------------------------

class AdminUserOut(BaseModel):
    id: int
    email: str
    created_at: datetime
    last_login_at: datetime | None = None
    is_admin: bool
    is_disabled: bool


# ---------------------------------------------------------------------------
# Admin — usage
# ---------------------------------------------------------------------------

class AdminUsageOut(BaseModel):
    date: str
    event_type: str
    count: int


# ---------------------------------------------------------------------------
# Waitlist
# ---------------------------------------------------------------------------

class WaitlistJoinIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class WaitlistJoinOut(BaseModel):
    status: str
    detail: str


class AdminWaitlistOut(BaseModel):
    id: int
    email: str
    status: WaitlistStatus
    notes: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by_admin_id: int | None = None


# ---------------------------------------------------------------------------
# Admin — login events
# ---------------------------------------------------------------------------

class LoginEventOut(BaseModel):
    id: int
    user_id: int
    ip: str
    user_agent: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Usage limits
# ---------------------------------------------------------------------------

class UsageLimitsOut(BaseModel):
    memories_per_day: int
    recalls_per_day: int
    projects_per_day: int


class UsageOut(BaseModel):
    day: str
    memories_created: int
    recall_queries: int
    projects_created: int
    limits: UsageLimitsOut
