# Frontend Dockerfile

# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files (context is frontend/ directory)
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm@10

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Run development server with hot reload
CMD ["pnpm", "dev"]

# Builder stage for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm@10

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build

# Production stage (for Cloudflare Pages / local testing)
FROM node:20-alpine AS production

WORKDIR /app

# Copy built files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]