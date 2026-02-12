# ContextCache Agent Instructions (MVP)

## Goal (Phase 1 MVP ONLY)
Implement Postgres-backed:
- Projects
- Memory Cards
- Recall endpoint (token overlap + recency)
- Memory pack output grouped by type

## Do NOT add
- Auth/teams/roles
- Embeddings/vector DB
- Graph DB
- MCP/agents
- Redis/Kafka/extra infra

## Source of truth
- docs/01-mvp-scope.md
- docs/04-api-contract.md
- docker-compose.yml

## Local commands
- Run: docker compose up -d --build
- Logs: docker compose logs -n 100 api db
- Swagger: http://localhost:8000/docs
