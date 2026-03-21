# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS base

WORKDIR /app

# Install uv + git (git is only needed when the optional private engine is enabled)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git openssh-client && \
    rm -rf /var/lib/apt/lists/* && \
    pip install --no-cache-dir uv

# Copy dependency metadata and lockfile (better layer caching)
COPY pyproject.toml uv.lock /app/

RUN set -eu; \
    cat > /usr/local/bin/strip-private-engine-lock <<'EOF'
#!/usr/bin/env python3
from pathlib import Path


def strip_contextcache_engine_block(lines: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line == "[package.optional-dependencies]\n":
            block: list[str] = [line]
            i += 1
            while i < len(lines) and not lines[i].startswith("[") and not lines[i].startswith("[["):
                block.append(lines[i])
                i += 1
            joined = "".join(block)
            if 'private-engine = [\n    { name = "contextcache-engine" },\n]\n' in joined:
                cleaned = joined.replace(
                    'private-engine = [\n    { name = "contextcache-engine" },\n]\n',
                    "",
                )
                if cleaned.strip():
                    out.extend(cleaned.splitlines(keepends=True))
            else:
                out.extend(block)
            continue

        if line == "[package.metadata]\n":
            out.append(line)
            i += 1
            while i < len(lines) and not lines[i].startswith("[") and not lines[i].startswith("[["):
                if 'contextcache-engine' not in lines[i]:
                    out.append(lines[i])
                i += 1
            continue

        if line == "[[package]]\n" and i + 1 < len(lines) and lines[i + 1] == 'name = "contextcache-engine"\n':
            i += 2
            while i < len(lines) and not lines[i].startswith("[[package]]\n"):
                i += 1
            continue

        out.append(line)
        i += 1
    return out


lock_path = Path("/app/uv.lock")
lock_path.write_text("".join(strip_contextcache_engine_block(lock_path.read_text().splitlines(keepends=True))))
EOF
    chmod +x /usr/local/bin/strip-private-engine-lock

FROM base AS dev-deps
# Install all deps (including dev/test). The private engine is optional: when
# ENGINE_TOKEN is absent, local fallback shims keep dev/test/CI runnable.
RUN --mount=type=secret,id=engine_pat,required=false \
    set -eu; \
    token=""; \
    if [ -f /run/secrets/engine_pat ]; then \
      token="$(tr -d '\r\n' < /run/secrets/engine_pat)"; \
    fi; \
    git_home="$(mktemp -d)"; \
    export HOME="$git_home"; \
    trap 'rm -rf "$git_home"' EXIT; \
    if [ -n "$token" ]; then \
      git config --global url."https://${token}@github.com/thecontextcache/contextcache-engine.git".insteadOf "ssh://git@github.com/thecontextcache/contextcache-engine.git"; \
      git config --global url."https://${token}@github.com/".insteadOf "ssh://git@github.com/"; \
      git config --global url."https://${token}@github.com/".insteadOf "git+ssh://git@github.com/"; \
      git config --global url."https://${token}@github.com/".insteadOf "git@github.com:"; \
      uv sync --frozen --extra private-engine; \
    else \
      strip-private-engine-lock; \
      uv sync --frozen; \
    fi

FROM base AS runtime-deps
# Install runtime deps only. The private engine repo is fetched through a
# BuildKit secret so the credential never appears in build ARG/ENV metadata.
# When the secret is absent, runtime falls back to the local shim modules.
RUN --mount=type=secret,id=engine_pat,required=false \
    set -eu; \
    token=""; \
    if [ -f /run/secrets/engine_pat ]; then \
      token="$(tr -d '\r\n' < /run/secrets/engine_pat)"; \
    fi; \
    git_home="$(mktemp -d)"; \
    export HOME="$git_home"; \
    trap 'rm -rf "$git_home"' EXIT; \
    if [ -n "$token" ]; then \
      git config --global url."https://${token}@github.com/thecontextcache/contextcache-engine.git".insteadOf "ssh://git@github.com/thecontextcache/contextcache-engine.git"; \
      git config --global url."https://${token}@github.com/".insteadOf "ssh://git@github.com/"; \
      git config --global url."https://${token}@github.com/".insteadOf "git+ssh://git@github.com/"; \
      git config --global url."https://${token}@github.com/".insteadOf "git@github.com:"; \
      uv sync --frozen --no-dev --extra private-engine; \
    else \
      strip-private-engine-lock; \
      uv sync --frozen --no-dev; \
    fi; \
    /app/.venv/bin/python -c "import sqlalchemy, alembic, celery"

FROM runtime-deps AS runtime
# Copy the application code
COPY app /app/app
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY scripts /app/scripts

EXPOSE 8000
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-1}\" = \"1\" ]; then uv run --no-sync python -m app.migrate; fi && uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000"]

FROM dev-deps AS dev
COPY app /app/app
COPY tests /app/tests
COPY pytest.ini /app/pytest.ini
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY scripts /app/scripts
CMD ["uv", "run", "pytest", "-q"]
