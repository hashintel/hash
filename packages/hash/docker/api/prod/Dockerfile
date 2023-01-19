FROM node:16.18.1-alpine AS builder

WORKDIR /app

# Ensure that the node module layer can be cached
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# Also ensure that api node modules can be cached
COPY libs/@local/eslint-config/package.json libs/@local/eslint-config/
COPY libs/@local/hash-backend-utils/package.json libs/@local/hash-backend-utils/
COPY libs/@local/hash-isomorphic-utils/package.json libs/@local/hash-isomorphic-utils/
COPY libs/@local/tsconfig/package.json libs/@local/tsconfig/
COPY packages/hash/api/package.json packages/hash/api/
COPY packages/hash/subgraph/package.json packages/hash/subgraph/
COPY packages/graph/clients/typescript/package.json packages/graph/clients/typescript/
RUN yarn workspace @hashintel/hash-api install --frozen-lockfile --ignore-scripts --prefer-offline

COPY libs/@local/hash-isomorphic-utils/src/graphql libs/@local/hash-isomorphic-utils/src/graphql
COPY libs/@local/hash-isomorphic-utils/src/queries libs/@local/hash-isomorphic-utils/src/queries
COPY packages/hash/api/codegen.config.ts packages/hash/api/codegen.config.ts
COPY packages/hash/api/src/graphql/type-defs packages/hash/api/src/graphql/type-defs

RUN yarn workspace @hashintel/hash-api codegen

COPY libs/@local/hash-isomorphic-utils/codegen.config.ts libs/@local/hash-isomorphic-utils/codegen.config.ts

RUN yarn workspace @local/hash-isomorphic-utils codegen

COPY libs/@local/eslint-config libs/@local/eslint-config
COPY libs/@local/hash-backend-utils libs/@local/hash-backend-utils
COPY libs/@local/hash-isomorphic-utils libs/@local/hash-isomorphic-utils
COPY libs/@local/tsconfig libs/@local/tsconfig
COPY packages/graph/clients/typescript packages/graph/clients/typescript
COPY packages/hash/api packages/hash/api
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
