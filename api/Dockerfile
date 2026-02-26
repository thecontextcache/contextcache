FROM python:3.11-slim AS base

WORKDIR /app

# Install uv + git (git needed to pull private contextcache-engine)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git openssh-client && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir uv

# Copy dependency metadata and lockfile (better layer caching)
COPY pyproject.toml uv.lock /app/

FROM base AS dev-deps
# Install all deps (including dev/test)
RUN uv sync

FROM base AS runtime-deps
# Install runtime deps only — use HTTPS + token for private engine repo
ARG ENGINE_TOKEN=""
RUN if [ -n "$ENGINE_TOKEN" ]; then \
      git config --global url."https://${ENGINE_TOKEN}@github.com/".insteadOf "ssh://git@github.com/"; \
      git config --global url."https://${ENGINE_TOKEN}@github.com/".insteadOf "git+ssh://git@github.com/"; \
    fi && \
    uv sync --no-dev && \
    git config --global --unset-all url."https://${ENGINE_TOKEN}@github.com/".insteadOf 2>/dev/null || true

FROM runtime-deps AS runtime
# Copy the application code
COPY app /app/app
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY scripts /app/scripts

EXPOSE 8000
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-1}\" = \"1\" ]; then /app/.venv/bin/python -m app.migrate; fi && /app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000"]

FROM dev-deps AS dev
COPY app /app/app
COPY tests /app/tests
COPY pytest.ini /app/pytest.ini
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY scripts /app/scripts
CMD ["uv", "run", "pytest", "-q"]
