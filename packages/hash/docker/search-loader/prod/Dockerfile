FROM node:16 AS builder

WORKDIR /app

COPY packages/hash/backend-utils packages/hash/backend-utils
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/search-loader packages/hash/search-loader
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/shared packages/hash/shared
COPY package.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,target=/yarn-cache \
  --mount=type=cache,target=/var/cache/apt \
  --mount=type=cache,target=/var/lib/apt \
  yarn ws:hash-search-loader install \
  && yarn ws:hash-search-loader build \
  && yarn ws:hash-search-loader install --production --ignore-scripts --prefer-offline # Remove devDependencies

#########################################################################################

FROM ubuntu:20.04

COPY --from=builder /app /app
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Run as a non-root user
RUN groupadd -g 999 appuser \
  && useradd -r -u 999 -g appuser appuser

USER appuser

ENTRYPOINT ["node", "packages/hash/search-loader/dist/index.js"]
