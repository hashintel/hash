FROM node:16

WORKDIR /app

COPY packages/hash/backend packages/hash/backend
COPY packages/hash/prettier-config packages/hash/prettier-config
COPY packages/hash/shared packages/hash/shared
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/frontend packages/hash/frontend
COPY packages/hash/backend-utils packages/hash/backend-utils
COPY package.json .
COPY tsconfig.json .
COPY tsconfig.base.json .
COPY yarn.lock .
COPY packages/hash/docker/api/dev/start.sh .

RUN --mount=type=cache,target=/yarn-cache \
    --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt-get update \
    && apt-get install wait-for-it \
    && chmod +x start.sh \
    && yarn install --cache-folder /yarn-cache
