FROM node:16

WORKDIR /app

COPY packages/hash/backend-utils packages/hash/backend-utils
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/search-loader packages/hash/search-loader
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/shared packages/hash/shared
COPY package.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,mode=0755,target=/yarn-cache \
  --mount=type=cache,mode=0755,target=/var/cache/apt \
  --mount=type=cache,mode=0755,target=/var/lib/apt \
  yarn install --ignore-scripts --cache-folder /yarn-cache

ENTRYPOINT [ "yarn", "workspace", "@hashintel/hash-search-loader", "dev" ]
