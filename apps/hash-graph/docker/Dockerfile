FROM alpine:3.17 as rust

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

FROM rust AS builder
WORKDIR /usr/local/src/hash-graph
COPY . .
ARG PROFILE=production

# To be removed once https://github.com/open-telemetry/opentelemetry-rust/issues/934 is sorted
RUN apk add --no-cache make protobuf-dev

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/src/hash-graph/target \
    cargo install --path bin/cli --profile $PROFILE --all-features --locked

# Replace with `FROM scratch` when a health check command was added to hash-graph
FROM alpine:3.17 AS runtime

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appgroup:appuser /usr/local/cargo/bin/hash-graph /

RUN install -d -m 0755 -o appuser -g appgroup /log

USER appuser

HEALTHCHECK --interval=2s --timeout=1s --retries=5 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api-doc/openapi.json || exit 1

ENTRYPOINT ["/hash-graph"]
CMD ["server", "--api-host", "0.0.0.0"]
