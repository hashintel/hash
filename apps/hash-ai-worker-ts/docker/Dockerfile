FROM node:22.12-alpine AS base

WORKDIR /app

COPY package.json .
RUN apk add --no-cache jq yq && \
    npm install -g "turbo@$(jq -r '.devDependencies.turbo' < package.json)"
COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN turbo prune --scope='@apps/hash-ai-worker-ts' --docker && \
    find $(yq '.workspace.members' -p toml -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
      [ -f "/app/out/full/$1" ] || ( \
        mkdir -p "/app/out/full/$(dirname "$1")/src" &&  \
        echo > "/app/out/full/$(dirname "$1")/src/lib.rs" &&  \
        echo -e "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/app/out/full/$1" \
      )' _ {} \; && \
    cp -R .cargo Cargo.toml Cargo.lock /app/out/full/


FROM node:22.12-slim AS rust

WORKDIR /usr/local/

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY rust-toolchain.toml .
RUN apt-get update && \
    apt-get install -y --no-install-recommends default-jre-headless wget g++ libc-dev && \
    rm -rf /var/lib/apt/lists/* && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show && \
    cargo install wasm-opt --debug


FROM rust AS installer

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/.yarn .yarn
COPY --from=base /app/out/full/turbo.json turbo.json

RUN corepack enable && \
    yarn install --immutable && \
    yarn cache clean

COPY --from=base /app/out/full/ .

RUN yarn turbo build --filter '@apps/hash-ai-worker-ts' --env-mode=loose && rm -rf target/


FROM node:22.12-slim AS runner

COPY --from=installer /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-ai-worker-ts

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

ARG GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON
ENV GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON=${GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON}

RUN if [ -n "$GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON" ]; then \
    echo $GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON > /tmp/google_workload_identity_federation_config.json && \
    export GOOGLE_APPLICATION_CREDENTIALS=/tmp/google_workload_identity_federation_config.json && \
    echo "GOOGLE_APPLICATION_CREDENTIALS set from JSON"; \
    else \
    echo "GOOGLE_APPLICATION_CREDENTIALS not set, no GOOGLE_CLOUD_WORKLOAD_IDENTITY_FEDERATION_CONFIG_JSON in environment"; \
    fi

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --system --gid 60000 hash && \
    useradd --system tsworker -G hash && \
    install -d -m 0775 -o tsworker -g hash /log

RUN mkdir -p officeParserTemp/tempfiles && \
    chown -R tsworker:hash officeParserTemp

USER tsworker:hash
ENV NODE_ENV=production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:4100/health || exit 1
