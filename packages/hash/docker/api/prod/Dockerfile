FROM node:16 AS builder

WORKDIR /app

COPY packages/hash/backend packages/hash/backend
COPY packages/hash/prettier-config packages/hash/prettier-config
COPY packages/hash/shared packages/hash/shared
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/frontend packages/hash/frontend
COPY package.json .
COPY tsconfig.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,target=/yarn-cache \
    --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    yarn ws:hash-backend install --cache-folder /yarn-cache \
    && yarn ws:hash-backend codegen && yarn ws:hash-frontend codegen && yarn ws:hash-shared codegen \
    && yarn ws:hash-backend build \
    # Removes devDependencies
    && yarn install --production --ignore-scripts --prefer-offline --cache-folder /yarn-cache

#########################################################################################

FROM ubuntu:20.04

COPY --from=builder /app /app
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Run as a non-root user
RUN groupadd -g 999 appuser \
    && useradd -r -u 999 -g appuser appuser

USER appuser

ENTRYPOINT ["node", "packages/hash/backend/dist/src/index.js"]
