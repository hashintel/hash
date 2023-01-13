FROM node:16.18.1-alpine AS builder

WORKDIR /app

# Ensure that the node module layer can be cached
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# Also ensure that api node modules can be cached
COPY libs/@local/tsconfig/package.json libs/@local/tsconfig/
COPY libs/@local/eslint-config/package.json libs/@local/eslint-config/
COPY packages/hash/api/package.json packages/hash/api/
COPY packages/hash/shared/package.json packages/hash/shared/
COPY packages/hash/subgraph/package.json packages/hash/subgraph/
COPY packages/hash/backend-utils/package.json packages/hash/backend-utils/
COPY packages/graph/clients/typescript/package.json packages/graph/clients/typescript/
RUN yarn workspace @hashintel/hash-api install --frozen-lockfile --ignore-scripts --prefer-offline

COPY packages/hash/api/codegen.config.ts packages/hash/api/codegen.config.ts
COPY packages/hash/api/src/graphql/type-defs packages/hash/api/src/graphql/type-defs
COPY packages/hash/shared/src/queries packages/hash/shared/src/queries
COPY packages/hash/shared/src/graphql packages/hash/shared/src/graphql

RUN yarn workspace @hashintel/hash-api codegen

COPY packages/hash/shared/codegen.config.ts packages/hash/shared/codegen.config.ts

RUN yarn workspace @hashintel/hash-shared codegen

COPY libs/@local/tsconfig libs/@local/tsconfig
COPY libs/@local/eslint-config libs/@local/eslint-config
COPY packages/graph/clients/typescript packages/graph/clients/typescript
COPY packages/hash/backend-utils packages/hash/backend-utils
COPY packages/hash/api packages/hash/api
COPY packages/hash/shared packages/hash/shared
COPY packages/hash/subgraph packages/hash/subgraph
RUN mkdir -p /app/var/uploads


#########################################################################################

FROM node:16.18.1-alpine

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appgroup:appuser /app /app

WORKDIR /app

USER appuser
ENV NODE_ENV production

HEALTHCHECK --interval=2s --timeout=10s --retries=5 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001 || exit 1

CMD ["yarn", "workspace","@hashintel/hash-api", "start"]
