from __future__ import annotations

from datetime import datetime
from typing import List, Literal
from pydantic import BaseModel, Field

MemoryType = Literal["decision", "finding", "definition", "note", "link", "todo"]
RoleType = Literal["owner", "admin", "member", "viewer"]


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ProjectOut(BaseModel):
    id: int
    org_id: int
    created_by_user_id: int | None = None
    name: str
    created_at: datetime


class MemoryCreate(BaseModel):
    type: MemoryType
    content: str = Field(min_length=1)


class MemoryOut(BaseModel):
    id: int
    project_id: int
    type: str
    content: str
    created_at: datetime


class RecallItemOut(MemoryOut):
    rank_score: float | None = None


class RecallOut(BaseModel):
    project_id: int
    query: str
    memory_pack_text: str
    items: List[RecallItemOut]


class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class OrgOut(BaseModel):
    id: int
    name: str
    created_at: datetime


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


class AdminUserOut(BaseModel):
    id: int
    email: str
    created_at: datetime
    last_login_at: datetime | None = None
    is_admin: bool
    is_disabled: bool


class AdminUsageOut(BaseModel):
    date: str
    event_type: str
    count: int
