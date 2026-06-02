# Base image
FROM node:20-alpine AS base

# Install ffmpeg (for audio conversion) and curl (to download yt-dlp)
RUN apk add --no-cache ffmpeg curl python3

# Install the LATEST yt-dlp directly from its GitHub release
# (Alpine's apk version can be months out of date and gets blocked by YouTube)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && yt-dlp --version

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Skip youtube-dl-exec's postinstall download — we use the system yt-dlp instead
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1
RUN npm ci

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js telemetry disable
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# Copy built assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
