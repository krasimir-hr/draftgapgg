# ── Stage 1: build the Vite SPA ──────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at build time. Same-origin in production (Caddy proxies
# /api to the backend), so this is just the public site URL.
ARG VITE_API_URL=http://localhost
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: serve the SPA + reverse-proxy via Caddy ─────────────────────
FROM caddy:2-alpine

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
