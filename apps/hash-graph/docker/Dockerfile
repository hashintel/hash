FROM alpine:3.21 AS mise

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV PATH="/mise/shims:$PATH"

RUN apk add --no-cache curl bash && \
    curl https://mise.run | sh

SHELL [ "/bin/bash", "-euo", "pipefail", "-c" ]

COPY .config/mise /etc/mise

RUN eval "$(mise activate bash)"


FROM mise AS base

WORKDIR /app

RUN apk add --no-cache npm && \
    mise use --global npm:turbo yq

COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN turbo prune --scope='@apps/hash-graph' --docker && \
    find $(yq '.workspace.members' -p toml -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
    [ -f "/app/out/full/$1" ] || ( \
    mkdir -p "/app/out/full/$(dirname "$1")/src" &&  \
    echo > "/app/out/full/$(dirname "$1")/src/lib.rs" &&  \
    echo -e "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/app/out/full/$1" \
    )' _ {} \; && \
    cp -R .cargo Cargo.toml Cargo.lock /app/out/full/


FROM mise AS rust

WORKDIR /usr/local/

ENV MISE_CARGO_HOME="/usr/local/cargo" \
    PATH="$PATH:/usr/local/cargo/bin"

COPY rust-toolchain.toml .
RUN apk add --no-cache gcc && \
    mise use --global yq && \
    mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml) && \
    rm rust-toolchain.toml


FROM rust AS builder

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/.yarn .yarn
COPY --from=base /app/out/full/turbo.json turbo.json

RUN mise install yarn && \
    mise use --global protoc && \
    apk add --no-cache gcc musl-dev npm && \
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
    cargo install --path apps/hash-graph --root /tmp --features "${FEATURES// /,}" --profile $PROFILE --locked && \
    mkdir -p /out/etc && \
    cp /tmp/bin/hash-graph /out/hash-graph && \
    echo 'graph:x:61000:60000:hash-graph:/:' > /out/etc/passwd && \
    echo 'hash:x:60000:' > /out/etc/group && \
    install -d -m 0775 -o 61000 -g 60000 /out/logs


FROM scratch AS runner

COPY --from=builder /out/ /

USER graph:hash

ENTRYPOINT ["/hash-graph"]
