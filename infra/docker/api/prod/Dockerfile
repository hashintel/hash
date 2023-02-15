FROM node:16.18.1-alpine AS builder

WORKDIR /app

# Ensure that the node module layer can be cached
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# Also ensure that api node modules can be cached
COPY apps/hash-api/package.json apps/hash-api/
COPY libs/@local/eslint-config/package.json libs/@local/eslint-config/
COPY libs/@local/hash-backend-utils/package.json libs/@local/hash-backend-utils/
COPY libs/@local/hash-graph-client/package.json libs/@local/hash-graph-client/
COPY libs/@local/hash-isomorphic-utils/package.json libs/@local/hash-isomorphic-utils/
COPY libs/@local/hash-graphql-shared/package.json libs/@local/hash-graphql-shared/
COPY libs/@local/hash-subgraph/package.json libs/@local/hash-subgraph/
COPY libs/@local/advanced-types/package.json libs/@local/advanced-types/
COPY libs/@local/tsconfig/package.json libs/@local/tsconfig/
RUN yarn workspace @apps/hash-api install --frozen-lockfile --ignore-scripts --prefer-offline

COPY apps/hash-api/codegen.config.ts apps/hash-api/codegen.config.ts
COPY apps/hash-api/src/graphql/type-defs apps/hash-api/src/graphql/type-defs
COPY libs/@local/hash-graphql-shared/src/graphql libs/@local/hash-graphql-shared/src/graphql
COPY libs/@local/hash-graphql-shared/src/queries libs/@local/hash-graphql-shared/src/queries

RUN yarn workspace @apps/hash-api codegen

COPY libs/@local/hash-graphql-shared/codegen.config.ts libs/@local/hash-graphql-shared/codegen.config.ts

RUN yarn workspace @local/hash-graphql-shared codegen

COPY libs/@local/hash-isomorphic-utils/codegen.config.ts libs/@local/hash-isomorphic-utils/codegen.config.ts

RUN yarn workspace @local/hash-isomorphic-utils codegen

COPY apps/hash-api apps/hash-api
COPY libs/@local/eslint-config libs/@local/eslint-config
COPY libs/@local/hash-backend-utils libs/@local/hash-backend-utils
COPY libs/@local/hash-graph-client libs/@local/hash-graph-client
COPY libs/@local/hash-graphql-shared libs/@local/hash-graphql-shared
COPY libs/@local/hash-isomorphic-utils libs/@local/hash-isomorphic-utils
COPY libs/@local/hash-subgraph libs/@local/hash-subgraph
COPY libs/@local/advanced-types libs/@local/advanced-types
COPY libs/@local/tsconfig libs/@local/tsconfig
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

CMD ["yarn", "workspace","@apps/hash-api", "start"]
