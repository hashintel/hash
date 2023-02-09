FROM alpine:3.17 as rust

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev bash && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

SHELL ["bash", "-c"]

FROM rust AS builder
WORKDIR /usr/local/src/hash-graph
COPY . .
ARG PROFILE=production
ARG TYPE_FETCHER=yes

# To be removed once https://github.com/open-telemetry/opentelemetry-rust/issues/934 is sorted
RUN apk add --no-cache make protobuf-dev

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/src/hash-graph/target \
    if [[ ${TYPE_FETCHER^^} == Y* || ${TYPE_FETCHER^^} == T* || $TYPE_FETCHER == 1 ]] ; then  \
      cargo install --path bin/cli --profile $PROFILE --features type-fetcher --locked; \
    else \
      cargo install --path bin/cli --profile $PROFILE --locked;  \
    fi

# Replace with `FROM scratch` when a health check command was added to hash-graph
FROM alpine:3.17 AS runtime

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appgroup:appuser /usr/local/cargo/bin/hash-graph /

RUN install -d -m 0755 -o appuser -g appgroup /log

USER appuser

ENTRYPOINT ["/hash-graph"]
