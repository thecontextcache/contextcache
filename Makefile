# ─────────────────────────────────────────────────────────────────────────────
# ContextCache — Developer & Production shortcuts
# Run all commands from the project root (~/srv/contextcache)
# ─────────────────────────────────────────────────────────────────────────────

PROD_COMPOSE := -f infra/docker-compose.prod.yml

.PHONY: help dev dev-down dev-logs prod-deploy prod-up prod-down prod-logs

help:               ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Local development ─────────────────────────────────────────────────────────

dev:                ## Start local dev stack (hot-reload)
	docker compose up -d

dev-down:           ## Stop local dev stack
	docker compose down

dev-logs:           ## Tail local dev logs
	docker compose logs -f

# ── Production ────────────────────────────────────────────────────────────────

prod-deploy:        ## Full clean-slate prod rebuild + deploy (use this every time)
	@echo "⏬  Stopping running containers..."
	docker compose $(PROD_COMPOSE) down --remove-orphans
	@echo "🧹  Pruning build cache..."
	docker system prune -f
	docker builder prune -f
	@echo "🔨  Building images from scratch (no cache)..."
	docker compose $(PROD_COMPOSE) build --no-cache
	@echo "🚀  Starting production stack..."
	docker compose $(PROD_COMPOSE) up -d
	@echo "✅  Done — production is live."

prod-up:            ## Start prod stack (uses existing images — fast)
	docker compose $(PROD_COMPOSE) up -d

prod-down:          ## Stop prod stack
	docker compose $(PROD_COMPOSE) down --remove-orphans

prod-logs:          ## Tail prod logs
	docker compose $(PROD_COMPOSE) logs -f
