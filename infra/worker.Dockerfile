# Worker Dockerfile

# Development stage
FROM python:3.13-slim AS development

WORKDIR /app

# Install dependencies (only main requirements for Docker)
COPY api/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY api/ .

# Run worker
CMD ["python", "run_worker.py"]

# Production stage
FROM python:3.13-slim AS production

# Create non-root user
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

WORKDIR /app

# Install dependencies
COPY api/requirements-prod.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-prod.txt

# Copy application code
COPY --chown=appuser:appuser api/ .

# Switch to non-root user
USER appuser

# Run worker
CMD ["python", "run_worker.py"]