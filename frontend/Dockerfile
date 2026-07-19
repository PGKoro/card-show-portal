FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at runtime — Railway (and Docker generally) only exposes a service's
# env vars to a Dockerfile build if it's declared as an ARG here; without
# this, `npm run build` silently falls back to lib/api.ts's localhost default
# no matter what's set in Railway's Variables tab.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000

# Production-realistic standalone server; docker-compose overrides this
# with `npm run dev` + a bind-mounted volume for local hot-reloading.
CMD ["node", "server.js"]
