# Worker Dockerfile
FROM python:3.13-slim

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