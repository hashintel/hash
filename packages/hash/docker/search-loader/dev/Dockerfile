FROM node:16

WORKDIR /app

COPY packages/hash/search-loader packages/hash/search-loader
COPY packages/hash/prettier-config packages/hash/prettier-config
COPY packages/hash/backend-utils packages/hash/backend-utils
COPY package.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,target=/yarn-cache \
    --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    yarn ws:hash-search-loader install \
    && yarn ws:hash-search-loader build

ENTRYPOINT [ "yarn", "ws:hash-search-loader", "dev" ]
