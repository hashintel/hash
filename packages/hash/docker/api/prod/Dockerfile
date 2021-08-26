FROM node:16 AS builder

WORKDIR /app

# Copy the package.json files first and run yarn install.
COPY packages/hash/backend packages/hash/backend
COPY packages/hash/frontend packages/hash/frontend
COPY packages/hash/shared packages/hash/shared
COPY packages/hash/prettier-config packages/hash/prettier-config
COPY package.json .
COPY tsconfig.json .
COPY tsconfig.base.json .

RUN yarn ws:hash-backend install \
    && yarn ws:hash-backend codegen \
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
