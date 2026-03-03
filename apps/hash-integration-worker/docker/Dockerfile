# syntax=docker/dockerfile:1

FROM debian:13.3-slim AS mise

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV MISE_VERBOSE=1
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

RUN mise trust && \
    turbo prune --scope='@apps/hash-integration-worker' --docker && \
    find $(yq '.workspace.members' -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
    [ -f "/app/out/full/$1" ] || ( \
    mkdir -p "/app/out/full/$(dirname "$1")/src" && \
    echo > "/app/out/full/$(dirname "$1")/src/lib.rs" && \
    printf "[package]\nname = \"$(yq ".package.name" $1)\"" > "/app/out/full/$1" \
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
    turbo build --filter '@apps/hash-integration-worker' --env-mode=loose


FROM mise AS runner

COPY --from=builder /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-integration-worker

# Set a writable Corepack cache directory
ENV COREPACK_HOME=/usr/local/src/var/corepack-cache
RUN groupadd --system --gid 60000 hash && \
    useradd --system integrationworker -G hash && \
    install -d -m 0775 -o integrationworker -g hash /log /home/integrationworker $COREPACK_HOME && \
    corepack prepare --activate

USER integrationworker:hash
ENV NODE_ENV=production

ENTRYPOINT [ "yarn"]
CMD ["start"]

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:4300/health || exit 1
