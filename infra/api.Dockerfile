# syntax=docker/dockerfile:1.4

ARG PYTHON_VERSION=3.13

# Base stage with common dependencies
FROM python:${PYTHON_VERSION}-slim-bookworm AS base

# Prevent Python from writing pyc files and buffering stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libpq5 \
    libsodium23 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash appuser

WORKDIR /app

# Builder stage for dependencies
FROM base AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    libpq-dev \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY api/requirements.txt /app/

# Install Python dependencies
RUN pip install --user --no-cache-dir -r requirements.txt

# Development stage
FROM base AS development

# Install development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    vim \
    gcc \
    g++ \
    libpq-dev \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY api/ /app/api/

# Install package in editable mode
RUN pip install --user -e /app/api/

EXPOSE 8000

# Run with reload for development
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app/api"]

# Production stage
FROM base AS production

# Copy dependencies from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY api/ /app/api/

# Install package
RUN pip install --user /app/api/

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

# Build arguments for metadata
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# OCI labels
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.authors="ContextCache Contributors" \
      org.opencontainers.image.url="https://github.com/thecontextcache/contextcache" \
      org.opencontainers.image.documentation="https://thecontextcache.github.io/contextcache/docs" \
      org.opencontainers.image.source="https://github.com/thecontextcache/contextcache" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="ContextCache" \
      org.opencontainers.image.licenses="Apache-2.0 OR PolyForm-Noncommercial-1.0.0" \
      org.opencontainers.image.title="ContextCache API" \
      org.opencontainers.image.description="Privacy-first memory engine for AI - API service"

# Run production server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]