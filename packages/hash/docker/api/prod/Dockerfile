FROM node:16 AS builder

WORKDIR /app

# Copy the package.json files first and run yarn install.
COPY packages/hash/backend/package.json packages/hash/backend/package.json
COPY packages/hash/frontend/package.json packages/hash/frontend/package.json
COPY packages/hash/block-protocol/package.json packages/hash/block-protocol/package.json
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/prettier-config/package.json packages/hash/prettier-config/package.json
COPY package.json .
COPY tsconfig.json .
COPY tsconfig.json .
COPY tsconfig.base.json .

RUN yarn ws:hash-backend install

# Copy over the packages source now, after yarn install. This makes the build faster
# if no changes have been made to the package.json files.
COPY packages/hash/backend packages/hash/backend
COPY packages/hash/frontend packages/hash/frontend
COPY packages/hash/prettier-config packages/hash/prettier-config

RUN yarn ws:hash-backend codegen \
    && yarn ws:hash-backend build \
    # Removes devDependencies
    && yarn install --production --ignore-scripts --prefer-offline

#########################################################################################

FROM ubuntu:20.04

COPY --from=builder /app /app
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Run as a non-root user
RUN groupadd -g 999 appuser \
    && useradd -r -u 999 -g appuser appuser

USER appuser

ENTRYPOINT ["node", "packages/hash/backend/dist/index.js"]
