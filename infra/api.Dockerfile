# Multi-stage build for ContextCache API

# Development stage
FROM python:3.13-slim AS development

# Install system dependencies including curl for healthcheck
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements (use lightweight Cloud Run version)
COPY api/requirements-cloudrun.txt ./requirements.txt

# Install Python dependencies (lightweight for Cloud Run)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY api/ .

# Expose port
EXPOSE 8000

# Run with auto-reload for development
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Builder stage for production
FROM python:3.13-slim AS builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements (use full requirements for production)
COPY api/requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.13-slim AS production

# Create non-root user
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY --chown=appuser:appuser api/ .

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check (note: Cloud Run doesn't use HEALTHCHECK directive, it has its own probes)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
#     CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Expose port (Cloud Run will set PORT env var dynamically)
ENV PORT=8000

# Run application - respects PORT env var from Cloud Run
CMD uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2