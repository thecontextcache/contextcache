# ─────────────────────────────────────────────────────────────────────────────
# ContextCache — Developer & Production shortcuts
# Run all commands from the project root (~/srv/contextcache)
# ─────────────────────────────────────────────────────────────────────────────

# Compose overlay files for production
PROD_COMPOSE := --env-file .env -f infra/docker-compose.prod.yml
DEV_COMPOSE  := --env-file .env -f docker-compose.yml

.PHONY: help dev dev-down dev-logs prod-deploy prod-deploy-hard prod-up prod-down prod-logs prod-db-logs prod-status

help:               ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Local development ─────────────────────────────────────────────────────────

dev:                ## Start local dev stack (hot-reload, logs magic links to stdout)
	docker compose $(DEV_COMPOSE) up -d

dev-down:           ## Stop local dev stack
	docker compose $(DEV_COMPOSE) down

dev-logs:           ## Tail local dev logs
	docker compose $(DEV_COMPOSE) logs -f

# ── Production ────────────────────────────────────────────────────────────────

prod-deploy:        ## Low-downtime deploy: build first, recreate app services only
	@echo "🔨  Building updated images..."
	docker compose $(PROD_COMPOSE) build api worker beat web docs
	@echo "🚀  Recreating app services (db/redis stay up)..."
	docker compose $(PROD_COMPOSE) up -d --no-deps api worker beat web docs
	@echo "✅  Done — low-downtime deploy complete."

prod-deploy-hard:   ## Full clean-slate rebuild (includes downtime)
	@echo "⏬  Stopping running containers..."
	docker compose $(PROD_COMPOSE) down --remove-orphans
	@echo "🧹  Pruning build cache..."
	docker system prune -f
	docker builder prune -f
	@echo "🔨  Building images from scratch (no cache)..."
	docker compose $(PROD_COMPOSE) build --no-cache
	@echo "🚀  Starting production stack..."
	docker compose $(PROD_COMPOSE) up -d
	@echo "✅  Done — full clean-slate deploy is live."

prod-up:            ## Start prod stack with existing images (fast, no rebuild)
	docker compose $(PROD_COMPOSE) up -d

prod-down:          ## Stop prod stack
	docker compose $(PROD_COMPOSE) down --remove-orphans

prod-logs:          ## Tail prod logs
	docker compose $(PROD_COMPOSE) logs -f

prod-api-logs:      ## Tail API logs only
	docker compose $(PROD_COMPOSE) logs -f api

prod-db-logs:       ## Tail DB logs only
	docker compose $(PROD_COMPOSE) logs -f db

prod-status:        ## Show prod container status
	docker compose $(PROD_COMPOSE) ps
