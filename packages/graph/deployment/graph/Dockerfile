FROM alpine:3.16 as rust

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

FROM rust AS builder
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target \
    cargo install --path bin/hash_graph --all-features --locked

FROM scratch AS runtime
COPY --from=builder /usr/local/cargo/bin/hash-graph /
ENTRYPOINT ["/hash-graph"]
