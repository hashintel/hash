# syntax=docker/dockerfile:1

# Build from the repository root:
# docker buildx build --file apps/brunch-agent/docker/Dockerfile . --load

FROM debian:13.3-slim AS tools

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV PATH="/mise/shims:$PATH"

COPY .config/mise /etc/mise

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    /etc/mise/install.sh && \
    mise --version && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    eval "$(mise activate bash)" && \
    mise install --locked node npm:turbo yq


FROM tools AS pruner

WORKDIR /repo

COPY . .

RUN mise trust && \
    turbo prune $(.github/scripts/prune-scopes.sh '@apps/brunch-agent') --docker


FROM tools AS builder

WORKDIR /repo

RUN corepack enable

COPY --from=pruner /repo/out/json/ ./
COPY --from=pruner /repo/out/yarn.lock ./yarn.lock
COPY --from=pruner /repo/out/full/.yarn ./.yarn
COPY --from=pruner /repo/out/full/turbo.json ./turbo.json

RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn install --immutable

COPY --from=pruner /repo/out/full/ ./

RUN turbo run build --filter '@apps/brunch-agent' --env-mode=loose && \
    yarn workspaces focus @apps/brunch-agent --production && \
    rm -rf apps/brunch-agent/test


FROM tools AS runner

ENV NODE_ENV=production

WORKDIR /repo/apps/brunch-agent

COPY --from=builder /repo /repo

RUN groupadd --system --gid 60000 hash && \
    useradd --system --uid 60000 --gid hash --create-home brunch

USER brunch:hash

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

CMD ["node", "dist/server.mjs"]
