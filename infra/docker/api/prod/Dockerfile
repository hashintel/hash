FROM node:22.12-alpine AS base

WORKDIR /app

COPY package.json .
RUN apk add --no-cache jq yq && \
    npm install -g  "turbo@$(jq -r '.devDependencies.turbo' < package.json)"
COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN turbo prune --scope='@apps/hash-api' --docker && \
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

RUN yarn turbo build --filter '@apps/hash-api' --env-mode=loose && rm -rf target/


FROM node:22.12-slim AS runner

COPY --from=installer /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-api
RUN mkdir -p /usr/local/src/var/uploads

RUN groupadd --system --gid 60000 hash && \
    useradd --system api -G hash

# Set a writable Corepack cache directory
ENV COREPACK_HOME=/usr/local/src/var/corepack-cache
RUN mkdir -p $COREPACK_HOME && \
    chown api:hash $COREPACK_HOME && \
    corepack enable && corepack prepare --activate

ENTRYPOINT [ "yarn"]
CMD ["start"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    install -d -m 0775 -o api -g hash /log

USER api:hash
ENV NODE_ENV=production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:5001/health-check || exit 1
