FROM node:16 AS builder

WORKDIR /app

COPY packages/hash/api packages/hash/api
COPY packages/hash/shared packages/hash/shared
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/frontend packages/hash/frontend
COPY packages/hash/backend-utils packages/hash/backend-utils
COPY package.json .
COPY tsconfig.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,mode=0755,target=/yarn-cache \
  --mount=type=cache,mode=0755,target=/var/cache/apt \
  --mount=type=cache,mode=0755,target=/var/lib/apt \
  yarn workspace @hashintel/hash-api install --cache-folder /yarn-cache \
  && yarn workspace @hashintel/hash-api codegen && yarn workspace @hashintel/hash-frontend codegen && yarn workspace @hashintel/hash-shared codegen \
  && yarn workspace @hashintel/hash-api build \
  && yarn install --production --ignore-scripts --prefer-offline --cache-folder /yarn-cache # Remove devDependencies

#########################################################################################

FROM ubuntu:20.04

COPY --from=builder /app /app
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Run as a non-root user
RUN groupadd -g 999 appuser \
  && useradd -r -u 999 -g appuser appuser

USER appuser

ENTRYPOINT ["node", "packages/hash/api/dist/src/index.js"]
