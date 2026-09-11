# syntax=docker/dockerfile:1

# Build from the repository root:
# docker buildx build --file apps/brunch-agent/docker/Dockerfile . --load

FROM debian:13.3-slim AS mise

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
    mise install --locked node


FROM mise AS base

WORKDIR /repo

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    mise install --locked npm:turbo yq

COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN mise trust && \
    turbo prune $(.github/scripts/prune-scopes.sh '@apps/brunch-agent') --docker && \
    find $(yq '.workspace.members' -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
    [ -f "/repo/out/full/$1" ] || ( \
    mkdir -p "/repo/out/full/$(dirname "$1")/src" && \
    echo > "/repo/out/full/$(dirname "$1")/src/lib.rs" && \
    printf "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/repo/out/full/$1" \
    )' _ {} \; && \
    cp -R .cargo Cargo.toml Cargo.lock /repo/out/full/


FROM mise AS rust

WORKDIR /usr/local/

ENV MISE_CARGO_HOME="/usr/local/cargo" \
    PATH="$PATH:/usr/local/cargo/bin"

COPY rust-toolchain.toml .
RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    mise install --locked yq && \
    echo "Installing Rust toolchain: $(yq '.toolchain.channel' rust-toolchain.toml)" && \
    mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml) && \
    mise list rust && \
    rustc --version && \
    cargo --version && \
    rm rust-toolchain.toml


FROM rust AS builder

WORKDIR /repo

# The shared backend utilities pull the type-system (wasm-pack) and graph
# client (openapi-generator) builds into the graph, so the builder carries the
# same toolchain as the API and worker images. Installed before the dependency
# manifests so the layer survives dependency bumps.
RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    mise install --locked node npm:turbo java npm:@redocly/cli cargo-binstall cargo:cargo-insta github:wasm-bindgen/wasm-pack github:WebAssembly/binaryen protoc && \
    corepack enable

COPY --from=base /repo/out/json/ ./
COPY --from=base /repo/out/yarn.lock ./yarn.lock
COPY --from=base /repo/out/full/.yarn ./.yarn
COPY --from=base /repo/out/full/turbo.json ./turbo.json

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    yarn install --immutable && \
    yarn cache clean

COPY --from=base /repo/out/full/ ./

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/repo/target,sharing=locked \
    --mount=type=cache,target=/repo/.turbo/cache,sharing=locked \
    turbo run build --filter '@apps/brunch-agent' --env-mode=loose && \
    rm -rf apps/brunch-agent/test


FROM mise AS runner

ENV NODE_ENV=production
ENV PORT=3002
# RDS server certificates chain to Amazon's private CAs, which the system trust store does not carry.
ENV BRUNCH_POSTGRES_TLS_CA_PATH=/etc/ssl/certs/rds-global-bundle.pem
ADD --chmod=0444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem

WORKDIR /repo/apps/brunch-agent

COPY --from=builder /repo /repo

RUN groupadd --system --gid 60000 hash && \
    useradd --system --uid 60000 --gid hash --create-home brunch && \
    install --directory --owner brunch --group hash \
    /repo/apps/brunch-agent/.data-wipe-me

USER brunch:hash

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3002/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/server.mjs"]
