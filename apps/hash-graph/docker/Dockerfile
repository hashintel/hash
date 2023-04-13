FROM node:16.18.1-alpine AS rust

WORKDIR /usr/local/

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY apps/hash-graph/rust-toolchain.toml .
RUN apk add --no-cache gcc musl-dev bash && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show

SHELL ["bash", "-c"]


FROM rust as node_base

WORKDIR /usr/local/

# Ensure that the node module layer can be cached
COPY package.json .
COPY yarn.lock .

COPY ./libs/@local/status/. /usr/local/libs/@local/status

COPY libs/@local/eslint-config libs/@local/eslint-config
COPY libs/@local/tsconfig libs/@local/tsconfig

RUN yarn workspace @local/status install --frozen-lockfile --ignore-scripts --prefer-offline


FROM node_base AS builder

WORKDIR /usr/local/
COPY ./apps/hash-graph/. ./apps/hash-graph/

RUN yarn workspace @apps/hash-graph install --frozen-lockfile --ignore-scripts --prefer-offline

WORKDIR /usr/local/apps/hash-graph

ARG PROFILE=production
ARG TYPE_FETCHER=yes

# To be removed once https://github.com/open-telemetry/opentelemetry-rust/issues/934 is sorted
RUN apk add --no-cache make protobuf-dev

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/local/apps/hash-graph/target,sharing=locked \
    if [[ ${TYPE_FETCHER^^} == Y* || ${TYPE_FETCHER^^} == T* || $TYPE_FETCHER == 1 ]] ; then  \
      cargo install --path bin/cli --profile $PROFILE --features type-fetcher --locked; \
    else \
      cargo install --path bin/cli --profile $PROFILE --locked;  \
    fi

RUN mkdir -p /out/etc/ \
 && echo 'nobody:x:65534:65534:nobody:/:' > /out/etc/passwd \
 && echo 'nobody:x:65534:' > /out/etc/group \
 && install -d -m 0755 -o nobody -g nobody /out/log \
 && cp /usr/local/cargo/bin/hash-graph /out/hash-graph


FROM scratch AS runtime

COPY --from=builder /out/ /

USER nobody:nobody

ENTRYPOINT ["/hash-graph"]
