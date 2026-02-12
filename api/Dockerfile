FROM python:3.11-slim

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy dependency metadata and lockfile (better layer caching)
COPY pyproject.toml uv.lock /app/

# Install runtime deps from pyproject (non-dev)
RUN uv sync --no-dev

# Copy the application code
COPY app /app/app
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini

EXPOSE 8000
CMD ["sh", "-c", "uv run python -m app.migrate && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
