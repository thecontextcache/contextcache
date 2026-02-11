FROM python:3.11-slim

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy dependency metadata and lockfile (better layer caching)
COPY pyproject.toml uv.lock /app/

# Install exact locked deps from uv.lock
RUN uv sync --frozen --no-dev

# Copy the application code
COPY app /app/app

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
