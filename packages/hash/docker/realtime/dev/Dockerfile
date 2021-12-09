FROM node:16

WORKDIR /app

COPY packages/hash/realtime packages/hash/realtime
COPY packages/hash/backend-utils packages/hash/backend-utils
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY package.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,target=/yarn-cache \
  --mount=type=cache,target=/var/cache/apt \
  --mount=type=cache,target=/var/lib/apt \
  yarn workspace @hashintel/hash-realtime install

ENTRYPOINT [ "yarn", "workspace", "@hashintel/hash-realtime", "dev" ]
