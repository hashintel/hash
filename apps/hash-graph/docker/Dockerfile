# syntax=docker/dockerfile:1

FROM debian:12.10-slim AS mise

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV MISE_NODE_COREPACK=1
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
    turbo prune --scope='@apps/hash-graph' --docker && \
    find $(yq '.workspace.members' -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
    [ -f "/app/out/full/$1" ] || ( \
    mkdir -p "/app/out/full/$(dirname "$1")/src" &&  \
    echo > "/app/out/full/$(dirname "$1")/src/lib.rs" &&  \
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
    apt-get install -y --no-install-recommends build-essential musl-tools && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    mise install node npm:turbo protoc && \
    yarn install --immutable && \
    yarn cache clean

COPY --from=base /app/out/full/ .

ARG PROFILE=production
ARG ENABLE_TEST_SERVER=no

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/local/src/target,sharing=locked \
    FEATURES=() && \
    if [[ ${ENABLE_TEST_SERVER^^} == Y* || ${ENABLE_TEST_SERVER^^} == T* || $ENABLE_TEST_SERVER == 1 ]]; then \
    FEATURES+=("test-server"); \
    fi && \
    if [[ ${PROFILE} == dev ]]; then \
    export RUSTFLAGS="-C debuginfo=line-tables-only" && \
    export PROFILE=dev-llvm; \
    fi && \
    FEATURES=${FEATURES[@]} && \
    rustup target add "$(uname -m)-unknown-linux-musl" && \
    cargo install --target "$(uname -m)-unknown-linux-musl" --path apps/hash-graph --root /tmp --features "${FEATURES// /,}" --profile $PROFILE --locked && \
    mkdir -p /out/etc && \
    cp /tmp/bin/hash-graph /out/hash-graph && \
    echo 'graph:x:61000:60000:hash-graph:/:' > /out/etc/passwd && \
    echo 'hash:x:60000:' > /out/etc/group && \
    install -d -m 0775 -o 61000 -g 60000 /out/logs


FROM scratch AS runner

COPY --from=builder /out/ /

USER graph:hash

ENTRYPOINT ["/hash-graph"]
