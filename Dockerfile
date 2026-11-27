# Kush Enterprise web app (public site, staff app, customer portal and API) as one container.
# Used by render.yaml; runs on any Docker host. Needs DATABASE_URL and AUTH_SECRET at runtime.
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app
COPY . .

# The web app and the packages it uses (the Expo mobile app is not needed on the server).
RUN pnpm install --frozen-lockfile --filter "@kush/web..."
# Chromium for invoice, proforma, PO and statement PDFs.
RUN pnpm --filter @kush/web exec playwright install --with-deps chromium
RUN LOW_MEMORY_BUILD=1 pnpm --filter @kush/web build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "scripts/render-start.mjs"]
