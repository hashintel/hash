# We require `alpine3.18` for `yq 4.33` which includes TOML support
# The node version does not matter here as we only use it to install `turbo` and otherwise copy from this build stage
FROM node:20-alpine3.18 AS base

WORKDIR /app

RUN yarn global add turbo && apk add --no-cache yq
COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN turbo prune --scope='@apps/hash-graph' --docker && \
    yq --version && \
    find $(yq '.workspace.members' -p toml -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
      [ -f "/app/out/full/$1" ] || ( \
        mkdir -p "/app/out/full/$(dirname "$1")/src" &&  \
        echo > "/app/out/full/$(dirname "$1")/src/lib.rs" &&  \
        echo -e "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/app/out/full/$1" \
      )' _ {} \; && \
    cp Cargo.toml /app/out/full/


FROM node:18.15-alpine AS rust

WORKDIR /usr/local/

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev bash protobuf-dev && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

SHELL ["bash", "-c"]


FROM rust as installer

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/turbo.json turbo.json

RUN yarn config set network-timeout 300000 && \
    yarn install --frozen-lockfile --prefer-offline && \
    yarn cache clean

COPY --from=base /app/out/full/ .


FROM installer AS builder

WORKDIR /usr/local/src/apps/hash-graph

ARG PROFILE=production
ARG ENABLE_TEST_SERVER=no

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/local/src/apps/hash-graph/target,sharing=locked \
    FEATURES=(); \
    if [[ ${ENABLE_TEST_SERVER^^} == Y* || ${ENABLE_TEST_SERVER^^} == T* || $ENABLE_TEST_SERVER == 1 ]]; then \
      FEATURES+=("test-server"); \
    fi; \
    if [[ ${PROFILE} == dev ]]; then \
        export RUSTFLAGS="$RUSTFLAGS -C debuginfo=line-tables-only"; \
    fi; \
    FEATURES=${FEATURES[@]}; \
    cargo install --path bins/cli --features "${FEATURES// /,}" --profile $PROFILE --locked;

RUN mkdir -p /out/etc/ \
 && echo 'graph:x:61000:60000:hash-graph:/:' > /out/etc/passwd \
 && echo 'hash:x:60000:' > /out/etc/group \
 && install -d -m 0775 -o 61000 -g 60000 /out/logs \
 && cp /usr/local/cargo/bin/hash-graph /out/hash-graph


FROM scratch AS runtime

COPY --from=builder /out/ /

USER graph:hash

ENTRYPOINT ["/hash-graph"]
