from __future__ import annotations

from fastapi import FastAPI

from .db import engine
from .models import Base
from .routes import router

app = FastAPI(title="ContextCache API", version="0.1.0")

@app.on_event("startup")
async def startup() -> None:
    # MVP approach: auto-create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.include_router(router)

@app.get("/health")
def health():
    return {"status": "ok"}
