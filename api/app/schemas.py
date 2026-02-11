from __future__ import annotations

from typing import List, Literal
from pydantic import BaseModel

MemoryType = Literal["decision", "finding", "definition", "note", "link", "todo"]


class ProjectCreate(BaseModel):
    name: str


class ProjectOut(BaseModel):
    id: int
    name: str


class MemoryCreate(BaseModel):
    type: MemoryType
    content: str


class MemoryOut(BaseModel):
    id: int
    project_id: int
    type: str
    content: str


class RecallOut(BaseModel):
    project_id: int
    query: str
    memory_pack_text: str
    items: List[MemoryOut]
