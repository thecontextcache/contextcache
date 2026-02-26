from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

MemoryType = Literal[
    "decision",
    "finding",
    "definition",
    "note",
    "link",
    "todo",
    "chat",
    "doc",
    "code",
    "file",
    "web",
    "event",
    "snippet",
    "issue",
    "context",
]
MemorySource = Literal["manual", "chatgpt", "claude", "cursor", "codex", "api", "extension"]
RoleType = Literal["owner", "admin", "member", "viewer"]
WaitlistStatus = Literal["pending", "approved", "rejected"]
RawCaptureSource = Literal["chrome_ext", "cli", "mcp", "email"]
InboxItemStatus = Literal["pending", "approved", "rejected", "merged"]


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


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


class MemoryUpdate(BaseModel):
    type: MemoryType | None = None
    source: MemorySource | None = None
    title: Optional[str] = Field(default=None, max_length=500)
    content: str | None = None
    metadata: Dict[str, Any] | None = None
    tags: List[str] | None = None


class MemoryCaptureIn(MemoryCreate):
    project_id: int = Field(ge=1)


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
    kv_cache_id: str | None = None
    memory_matrix: list[list[float]] | None = None

class RecallOut(BaseModel):
    project_id: int
    query: str
    memory_pack_text: str
    items: List[RecallItemOut]
    global_kv_cache_id: str | None = None
    global_memory_matrix: list[list[float]] | None = None


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


class OrgUpdate(BaseModel):
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
    last_used_at: datetime | None = None
    use_count: int = 0


class ApiKeyCreatedOut(ApiKeyOut):
    api_key: str


class ApiKeyAccessRequestCreate(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)


class ApiKeyAccessRequestReview(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class ApiKeyAccessRequestOut(BaseModel):
    id: int
    org_id: int
    requester_user_id: int
    requester_email: str
    requester_display_name: str | None = None
    status: Literal["pending", "approved", "rejected"]
    reason: str | None = None
    review_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by_user_id: int | None = None
    reviewed_by_email: str | None = None


# ---------------------------------------------------------------------------
# Memberships
# ---------------------------------------------------------------------------

class MeOut(BaseModel):
    org_id: int | None = None
    role: RoleType | None = None
    api_key_prefix: str | None = None
    actor_user_id: int | None = None


class MeOrgOut(BaseModel):
    id: int
    name: str
    role: RoleType | None = None


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


class MembershipUpdate(BaseModel):
    role: RoleType


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
    is_unlimited: bool = False
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
    is_unlimited: bool = False


class AdminUserStatsOut(BaseModel):
    user_id: int
    memory_count: int
    today_memories: int
    today_recalls: int
    today_projects: int


class AdminRecallLogOut(BaseModel):
    id: int
    org_id: int
    project_id: int
    actor_user_id: int | None = None
    strategy: str
    query_text: str
    input_memory_ids: list[int] = Field(default_factory=list)
    ranked_memory_ids: list[int] = Field(default_factory=list)
    weights: Dict[str, float] = Field(default_factory=dict)
    score_details: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CagCacheEntryOut(BaseModel):
    source: str
    hit_count: int
    pheromone_level: float
    last_accessed_at: str


class CagCacheStatsOut(BaseModel):
    enabled: bool
    mode: str
    embedding_model: str
    cache_items: int
    cache_max_items: int
    total_queries: int
    total_hits: int
    total_misses: int
    hit_rate: float
    total_evicted: int
    avg_pheromone: float
    last_evaporation_at: str | None = None
    evaporation_factor: float
    evaporation_interval_seconds: int
    kv_stub_enabled: bool
    kv_token_budget_used: int
    top_entries: list[CagCacheEntryOut] = Field(default_factory=list)


class AdminLlmHealthOut(BaseModel):
    provider: str
    model: str
    worker_enabled: bool
    google_api_key_configured: bool
    google_genai_installed: bool
    ready: bool
    notes: list[str] = Field(default_factory=list)


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
    name: str | None = Field(default=None, max_length=120)
    company: str | None = Field(default=None, max_length=180)
    use_case: str | None = Field(default=None, max_length=500)


class WaitlistJoinOut(BaseModel):
    status: str
    detail: str


class AdminWaitlistOut(BaseModel):
    id: int
    email: str
    name: str | None = None
    company: str | None = None
    use_case: str | None = None
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
    memories_per_week: int
    recalls_per_week: int
    projects_per_week: int


class UsageOut(BaseModel):
    day: str
    memories_created: int
    recall_queries: int
    projects_created: int
    week_start: str
    weekly_memories_created: int
    weekly_recall_queries: int
    weekly_projects_created: int
    limits: UsageLimitsOut


# ---------------------------------------------------------------------------
# Refinery pipeline — raw captures
# ---------------------------------------------------------------------------

class RawCaptureIn(BaseModel):
    """Payload for POST /ingest/raw."""
    source: RawCaptureSource
    payload: Dict[str, Any] = Field(default_factory=dict)
    project_id: Optional[int] = Field(default=None, ge=1)


class RawCaptureOut(BaseModel):
    id: int
    org_id: int
    project_id: Optional[int] = None
    source: str
    captured_at: datetime
    processed_at: Optional[datetime] = None


class RawCaptureQueuedOut(BaseModel):
    status: str
    capture_id: int


# ---------------------------------------------------------------------------
# Refinery pipeline — inbox items
# ---------------------------------------------------------------------------

class InboxItemOut(BaseModel):
    id: int
    project_id: int
    raw_capture_id: Optional[int] = None
    promoted_memory_id: Optional[int] = None
    suggested_type: str
    suggested_title: Optional[str] = None
    suggested_content: str
    confidence_score: float
    status: str
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class InboxItemEditIn(BaseModel):
    """Optional edits applied before approving an inbox item."""
    suggested_type: Optional[MemoryType] = None
    suggested_title: Optional[str] = Field(default=None, max_length=500)
    suggested_content: Optional[str] = Field(default=None, min_length=1)


class InboxListOut(BaseModel):
    project_id: int
    total: int
    items: List[InboxItemOut]
