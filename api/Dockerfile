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

FROM runtime-deps AS runtime
# Copy the application code
COPY app /app/app
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini

EXPOSE 8000
CMD ["sh", "-c", "uv run python -m app.migrate && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]

FROM dev-deps AS dev
COPY app /app/app
COPY tests /app/tests
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
CMD ["uv", "run", "pytest", "-q"]
