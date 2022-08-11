FROM alpine:3.16 as rust

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

FROM rust AS builder
WORKDIR app
COPY . .
RUN cargo build --profile production --all-features --locked && \
    cp target/production/hash-graph /tmp/hash-graph && \
    cargo clean && \
    rm -rf $CARGO_HOME/registry && \
    rm -rf $CARGO_HOME/.git

FROM scratch AS runtime
COPY --from=builder tmp/hash-graph /
ENTRYPOINT ["/hash-graph"]
