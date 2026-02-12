from __future__ import annotations

from datetime import datetime
from typing import List, Literal
from pydantic import BaseModel, Field

MemoryType = Literal["decision", "finding", "definition", "note", "link", "todo"]


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ProjectOut(BaseModel):
    id: int
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


class RecallOut(BaseModel):
    project_id: int
    query: str
    memory_pack_text: str
    items: List[MemoryOut]
