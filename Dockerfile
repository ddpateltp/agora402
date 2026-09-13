# Agora402: one image for the seller, the auditor and the buyer dashboard.
# The start command selects the process:
#   node packages/seller/dist/main.js        (SELLER_ROLE=services or auditor)
#   node packages/buyer/dist/dashboard.js    (serves packages/web/dist)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund
RUN npm run build
# Drop dev dependencies for the runtime layer; the workspace symlinks stay intact.
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S agora && adduser -S agora -G agora
COPY --from=build --chown=agora:agora /app/package.json /app/package-lock.json ./
COPY --from=build --chown=agora:agora /app/node_modules ./node_modules
COPY --from=build --chown=agora:agora /app/packages ./packages
COPY --from=build --chown=agora:agora /app/scripts ./scripts
USER agora
# App Runner sets the port per service; these are the defaults from .env.example.
EXPOSE 4402 4403 4404
CMD ["node", "packages/seller/dist/main.js"]
