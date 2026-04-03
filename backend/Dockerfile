# ──────────────────────────────────────────────────────────────────────────────
# Smart Crowd Management Backend — Dockerfile
# Node 20 Alpine | Non-root user | Health check
# ──────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base

# Install dumb-init for proper PID1 signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# ── Dependencies layer (cached if package.json unchanged) ──
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# ── Production image ──────────────────────────────────────
FROM base AS production

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Copy production deps
COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Copy source code
COPY --chown=nodeuser:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown nodeuser:nodejs logs

USER nodeuser

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
