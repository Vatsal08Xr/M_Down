# Base image
FROM node:20-alpine AS base

# Install Python, FFmpeg and yt-dlp
RUN apk add --no-cache python3 ffmpeg yt-dlp

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Skip youtube-dl-exec postinstall (it tries to download yt-dlp from GitHub which rate-limits)
# We use the system-wide yt-dlp installed via apk instead.
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1
RUN npm ci

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js telemetry disable
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# Copy built assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
