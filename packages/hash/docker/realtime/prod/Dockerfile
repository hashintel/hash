FROM node:16 AS builder

WORKDIR /app

COPY packages/hash/realtime packages/hash/realtime
COPY packages/hash/backend-utils packages/hash/backend-utils
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY package.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,mode=0755,target=/yarn-cache \
  --mount=type=cache,mode=0755,target=/var/cache/apt \
  --mount=type=cache,mode=0755,target=/var/lib/apt \
  yarn workspace @hashintel/hash-realtime install \
  && yarn workspace @hashintel/hash-realtime build \
  && yarn workspace @hashintel/hash-realtime install --production --ignore-scripts --prefer-offline # Remove devDependencies

#########################################################################################

FROM ubuntu:20.04

COPY --from=builder /app /app
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Run as a non-root user
RUN groupadd -g 999 appuser \
  && useradd -r -u 999 -g appuser appuser

USER appuser

ENTRYPOINT ["node", "packages/hash/realtime/dist/index.js"]
