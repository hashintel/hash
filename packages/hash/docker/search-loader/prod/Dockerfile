FROM node:16.18.1-alpine AS builder

WORKDIR /app

# Ensure that the node module layer can be cached
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# Also ensure that api node modules can be cached
COPY apps/hash-search-realtime/package.json apps/hash-search-realtime/
COPY libs/@local/hash-backend-utils/package.json libs/@local/hash-backend-utils/
COPY libs/@local/hash-shared/package.json libs/@local/hash-shared/
COPY libs/@local/tsconfig/package.json libs/@local/tsconfig/
COPY packages/hash/api/package.json packages/hash/api/
RUN yarn workspace @apps/hash-search-loader install --frozen-lockfile --ignore-scripts --prefer-offline

COPY libs/@local/hash-shared/src/graphql libs/@local/hash-shared/src/graphql
COPY libs/@local/hash-shared/src/queries libs/@local/hash-shared/src/queries
COPY packages/hash/api/codegen.config.ts packages/hash/api/codegen.config.ts
COPY packages/hash/api/src/collab/graphql/queries packages/hash/api/src/collab/graphql/queries
COPY packages/hash/api/src/graphql/type-defs packages/hash/api/src/graphql/type-defs

RUN yarn workspace @hashintel/hash-api codegen

COPY apps/hash-search-realtime apps/hash-search-realtime
COPY libs/@local/hash-backend-utils libs/@local/hash-backend-utils
COPY libs/@local/hash-shared libs/@local/hash-shared
COPY libs/@local/tsconfig libs/@local/tsconfig
COPY packages/hash/api packages/hash/api


#########################################################################################

FROM node:16.18.1-alpine

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder --chown=appgroup:appuser /app /app

WORKDIR /app

USER appuser
ENV NODE_ENV production

CMD ["yarn", "workspace","@apps/hash-search-loader", "start"]
