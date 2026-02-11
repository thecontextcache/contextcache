FROM python:3.11-slim

WORKDIR /app

# Install uv inside the container
RUN pip install --no-cache-dir uv

# Copy dependency metadata first (better layer caching)
COPY pyproject.toml requirements.lock /app/

# Install exact locked deps into system python
RUN uv pip sync --system /app/requirements.lock

# Copy the application code
COPY app /app/app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
