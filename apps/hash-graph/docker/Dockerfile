FROM node:16.18.1-alpine AS base

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-graph' --docker


FROM node:16.18.1-alpine AS rust

WORKDIR /usr/local/

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY --from=base /app/out/full/apps/hash-graph/rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev bash && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

SHELL ["bash", "-c"]


FROM rust as installer

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/turbo.json turbo.json

RUN yarn install --frozen-lockfile --prefer-offline && \
    yarn cache clean

COPY --from=base /app/out/full/ .


FROM installer AS builder

WORKDIR /usr/local/src/apps/hash-graph

ARG PROFILE=production
ARG ENABLE_TYPE_FETCHER=no
ARG ENABLE_TEST_SERVER=no

# To be removed once https://github.com/open-telemetry/opentelemetry-rust/issues/934 is sorted
RUN apk add --no-cache make protobuf-dev

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/local/src/apps/hash-graph/target,sharing=locked \
    FEATURES=(); \
    if [[ ${ENABLE_TYPE_FETCHER^^} == Y* || ${ENABLE_TYPE_FETCHER^^} == T* || $ENABLE_TYPE_FETCHER == 1 ]]; then \
      FEATURES+=("type-fetcher"); \
    fi; \
    if [[ ${ENABLE_TEST_SERVER^^} == Y* || ${ENABLE_TEST_SERVER^^} == T* || $ENABLE_TEST_SERVER == 1 ]]; then \
      export RUSTFLAGS="$RUSTFLAGS --cfg hash_graph_test_environment"; \
      FEATURES+=("test-server"); \
    fi; \
    FEATURES=${FEATURES[@]}; \
    cargo install --path bin/cli --features "${FEATURES// /,}" --profile $PROFILE --locked;

RUN mkdir -p /out/etc/ \
 && echo 'graph:x:61000:60000:hash-graph:/:' > /out/etc/passwd \
 && echo 'hash:x:60000:' > /out/etc/group \
 && install -d -m 0775 -o 61000 -g 60000 /out/log \
 && cp /usr/local/cargo/bin/hash-graph /out/hash-graph


FROM scratch AS runtime

COPY --from=builder /out/ /

USER graph:hash

ENTRYPOINT ["/hash-graph"]
