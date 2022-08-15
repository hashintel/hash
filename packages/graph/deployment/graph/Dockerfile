FROM alpine:3.16 as rust

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY hash_graph/rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

FROM rust AS builder
WORKDIR /usr/local/src/graph
COPY hash_graph .
ARG PROFILE=production
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo install --path bin/hash_graph --profile $PROFILE --all-features --locked

FROM node:18.7.0-alpine3.16 as runtime
COPY migrations/ /migrations/
WORKDIR /migrations
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install

COPY deployment/graph/migrate_and_run.sh /usr/local/bin/migrate_and_run.sh
COPY --from=builder /usr/local/cargo/bin/hash-graph /usr/local/bin/

ENTRYPOINT ["/usr/local/bin/migrate_and_run.sh"]
