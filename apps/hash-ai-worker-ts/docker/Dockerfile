# syntax=docker/dockerfile:1

FROM debian:12.10-slim AS mise

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV PATH="/mise/shims:$PATH"

COPY .config/mise /etc/mise

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    export MISE_VERSION=2026.1.12 && curl https://mise.run | sh && \
    mise --version && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    eval "$(mise activate bash)" && \
    mise install node


FROM mise AS base

WORKDIR /app

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    mise install npm:turbo yq

COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN mise trust && \
    turbo prune --scope='@apps/hash-ai-worker-ts' --docker && \
    find $(yq '.workspace.members' -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
    [ -f "/app/out/full/$1" ] || ( \
    mkdir -p "/app/out/full/$(dirname "$1")/src" && \
    echo > "/app/out/full/$(dirname "$1")/src/lib.rs" && \
    printf "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/app/out/full/$1" \
    )' _ {} \; && \
    cp -R .cargo Cargo.toml Cargo.lock /app/out/full/


FROM mise AS rust

WORKDIR /usr/local/

ENV MISE_CARGO_HOME="/usr/local/cargo" \
    PATH="$PATH:/usr/local/cargo/bin"

COPY rust-toolchain.toml .
RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    mise install yq && \
    echo "Installing Rust toolchain: $(yq '.toolchain.channel' rust-toolchain.toml)" && \
    mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml) && \
    echo "Rust installation completed. Checking versions:" && \
    mise list rust && \
    rustc --version && \
    cargo --version && \
    rm rust-toolchain.toml


FROM rust AS builder

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/.yarn .yarn
COPY --from=base /app/out/full/turbo.json turbo.json

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    mise install node npm:turbo java biome npm:@redocly/cli cargo-binstall cargo:wasm-pack cargo:wasm-opt protoc && \
    yarn install --immutable && \
    yarn cache clean

COPY --from=base /app/out/full/ .

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/local/src/target,sharing=locked \
    --mount=type=cache,target=/usr/local/src/.turbo/cache,sharing=locked \
    eval "$(mise activate bash)" && turbo build --filter '@apps/hash-ai-worker-ts' --env-mode=loose


FROM mise AS runner

COPY --from=builder /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-ai-worker-ts

ARG GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON
ENV GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON=${GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON}

# Set a writable Corepack cache directory
ENV COREPACK_HOME=/usr/local/src/var/corepack-cache
RUN GITHUB_TOKEN="" mise install node && \
    groupadd --system --gid 60000 hash && \
    useradd --system tsworker -G hash && \
    install -d -m 0775 -o tsworker -g hash /log /home/tsworker officeParserTemp/tempfiles $COREPACK_HOME && \
    corepack prepare --activate && \
    if [ -n "$GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON" ]; then \
    echo $GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON > /tmp/google_workload_identity_federation_config.json && \
    export GOOGLE_APPLICATION_CREDENTIALS=/tmp/google_workload_identity_federation_config.json && \
    echo "GOOGLE_APPLICATION_CREDENTIALS set from JSON"; \
    else \
    echo "GOOGLE_APPLICATION_CREDENTIALS not set, no GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON in environment"; \
    fi

ENTRYPOINT [ "yarn"]
CMD ["start"]

USER tsworker:hash
ENV NODE_ENV=production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:4100/health || exit 1
