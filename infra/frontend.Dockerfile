# syntax=docker/dockerfile:1.4

ARG NODE_VERSION=20

# Base stage
FROM node:${NODE_VERSION}-alpine AS base

# Install dependencies only when needed
FROM base AS deps

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# Copy package files
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development

RUN apk add --no-cache libc6-compat git

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY frontend/ ./

EXPOSE 3000

ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run development server
CMD ["pnpm", "dev"]

# Builder stage
FROM base AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY frontend/ ./

# Set build-time environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_ENV=production
ARG NEXT_PUBLIC_ENABLE_ANALYTICS=true
ARG NEXT_PUBLIC_ENABLE_EXPORT=true
ARG NEXT_PUBLIC_ENABLE_GRAPH_VIEW=true

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}
ENV NEXT_PUBLIC_ENABLE_ANALYTICS=${NEXT_PUBLIC_ENABLE_ANALYTICS}
ENV NEXT_PUBLIC_ENABLE_EXPORT=${NEXT_PUBLIC_ENABLE_EXPORT}
ENV NEXT_PUBLIC_ENABLE_GRAPH_VIEW=${NEXT_PUBLIC_ENABLE_GRAPH_VIEW}

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build application
RUN pnpm build

# Production stage
FROM base AS production

RUN apk add --no-cache curl

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Copy build output and node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Build arguments for metadata
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# OCI labels
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.authors="ContextCache Contributors" \
      org.opencontainers.image.url="https://github.com/thecontextcache/contextcache" \
      org.opencontainers.image.documentation="https://thecontextcache.github.io/contextcache" \
      org.opencontainers.image.source="https://github.com/thecontextcache/contextcache" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="ContextCache" \
      org.opencontainers.image.licenses="Apache-2.0 OR PolyForm-Noncommercial-1.0.0" \
      org.opencontainers.image.title="ContextCache Frontend" \
      org.opencontainers.image.description="Privacy-first memory engine for AI - Web interface"

# Run production server
CMD ["node", "server.js"]