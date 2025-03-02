FROM bitnami/minideb:bookworm AS mise

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV MISE_NODE_COREPACK=1
ENV PATH="/mise/shims:$PATH"

RUN apt-get update && \
    apt-get install -y --no-install-recommends bash curl ca-certificates && \
    curl https://mise.run | sh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

COPY .config/mise /etc/mise

RUN eval "$(mise activate bash)"


FROM mise AS base

WORKDIR /app

RUN mise install node && \
    mise use --global yq npm:turbo@$(jq -r '.devDependencies.turbo' < package.json)

COPY . .

RUN turbo prune --scope='@apps/hash-integration-worker' --docker && \
    find $(yq '.workspace.members' -p toml -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
    [ -f "/app/out/full/$1" ] || ( \
    mkdir -p "/app/out/full/$(dirname "$1")/src" && \
    echo > "/app/out/full/$(dirname "$1")/src/lib.rs" && \
    printf "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/app/out/full/$1" \
    )' _ {} \; && \
    cp -R .cargo Cargo.toml Cargo.lock /app/out/full/


FROM mise AS rust

WORKDIR /usr/local/

ENV MISE_CARGO_HOME="/usr/local/cargo" \
    PATH="$PATH:/usr/local/cargo/bin"

COPY rust-toolchain.toml .
RUN mise use --global yq && \
    mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml) && \
    rm rust-toolchain.toml


FROM rust AS builder

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/.yarn .yarn
COPY --from=base /app/out/full/turbo.json turbo.json

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    mise install node yarn java && \
    yarn install --immutable && \
    yarn cache clean

COPY --from=base /app/out/full/ .

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/local/src/target,sharing=locked \
    --mount=type=cache,target=/usr/local/src/.turbo/cache,sharing=locked \
    yarn turbo build --filter '@apps/hash-integration-worker' --env-mode=loose


FROM mise AS runner

COPY --from=builder /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-integration-worker

# Set a writable Corepack cache directory
ENV COREPACK_HOME=/usr/local/src/var/corepack-cache
RUN mise install node && \
    groupadd --system --gid 60000 hash && \
    useradd --system integrationworker -G hash && \
    install -d -m 0775 -o integrationworker -g hash /log /home/integrationworker $COREPACK_HOME && \
    corepack prepare --activate

ENTRYPOINT [ "yarn"]
CMD ["start"]

USER integrationworker:hash
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:4300/health || exit 1
