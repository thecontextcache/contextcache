FROM python:3.11-slim AS base

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy dependency metadata and lockfile (better layer caching)
COPY pyproject.toml uv.lock /app/

FROM base AS dev-deps
# Install all deps (including dev/test)
RUN uv sync

FROM base AS runtime-deps
# Install runtime deps only
RUN uv sync --no-dev

# Pull private engine package
RUN --mount=type=ssh uv add "contextcache-engine @ git+ssh://git@github.com/thecontextcache/contextcache-engine.git"

FROM runtime-deps AS runtime
# Copy the application code
COPY app /app/app
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY scripts /app/scripts

EXPOSE 8000
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-1}\" = \"1\" ]; then uv run python -m app.migrate; fi && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]

FROM dev-deps AS dev
COPY app /app/app
COPY tests /app/tests
COPY pytest.ini /app/pytest.ini
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY scripts /app/scripts
CMD ["uv", "run", "pytest", "-q"]
