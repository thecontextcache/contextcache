# Frontend build for Cloudflare Pages
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY frontend/ .

# Build
RUN pnpm build

# Production stage (for local testing, Cloudflare Pages uses own runtime)
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]