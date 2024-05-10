FROM node:20.13-alpine AS base

WORKDIR /app

COPY package.json .
RUN apk add --no-cache jq yq && \
    yarn global add "turbo@$(jq -r '.devDependencies.turbo' < package.json)"
COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN turbo prune --scope='@apps/hash-frontend' --docker && \
    find $(yq '.workspace.members' -p toml -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
      [ -f "/app/out/full/$1" ] || ( \
        mkdir -p "/app/out/full/$(dirname "$1")/src" &&  \
        echo > "/app/out/full/$(dirname "$1")/src/lib.rs" &&  \
        echo -e "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/app/out/full/$1" \
      )' _ {} \; && \
    cp Cargo.toml Cargo.lock /app/out/full/

# Turbo isn't aware of our patches by default (it would be if we use Yarn 2+ or pnpm).
# Therefore we manually add the patches to the pruned output to allow for the patches to be applied.
COPY patches /app/out/full/patches


FROM node:20.13-slim AS rust

WORKDIR /usr/local/

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=:$PATH:/usr/local/cargo/bin

COPY rust-toolchain.toml .
RUN apt-get update && \
    apt-get install -y --no-install-recommends default-jre-headless wget g++ libc-dev python3 make && \
    rm -rf /var/lib/apt/lists/* && \
    wget -q -O- https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal && \
    rustup show && \
    cargo install wasm-opt --debug


FROM rust AS installer

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/patches patches
COPY --from=base /app/out/full/turbo.json turbo.json

RUN yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=base /app/out/full/ .

ENV NODE_ENV production
ARG API_ORIGIN
ENV API_ORIGIN ${API_ORIGIN}
ARG FRONTEND_URL
ENV FRONTEND_URL ${FRONTEND_URL}

RUN yarn turbo build --filter '@apps/hash-frontend'


FROM node:20.13-slim AS runner

COPY --from=installer /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-frontend

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

RUN groupadd --system --gid 60000 hash && \
    useradd --system frontend -G hash

# Nextjs needs permissions to create caches
RUN chown -R frontend:hash .next

USER frontend:hash
ENV NODE_ENV production
