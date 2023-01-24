FROM node:16.18.1-alpine AS builder

WORKDIR /app

# Required dependencies for compiling the re2 NPM package
RUN apk add --no-cache libc6-compat python3 make g++

# Ensure that the node module layer can be cached
COPY turbo.json .
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --prefer-offline --force --build-from-source


# Also ensure that frontend node modules can be cached
COPY apps/hash-frontend/package.json apps/hash-frontend/
COPY apps/hash-graph/clients/typescript/package.json apps/hash-graph/clients/typescript/
COPY libs/@local/design-system/package.json libs/@local/design-system/
COPY libs/@local/eslint-config/package.json libs/@local/eslint-config/
COPY libs/@local/hash-isomorphic-utils/package.json libs/@local/hash-isomorphic-utils/
COPY libs/@local/hash-subgraph/package.json libs/@local/hash-subgraph/
COPY libs/@local/tsconfig/package.json libs/@local/tsconfig/
RUN yarn workspace @apps/hash-frontend install --frozen-lockfile --prefer-offline

COPY apps/hash-api/codegen.config.ts apps/hash-api/codegen.config.ts
COPY apps/hash-api/src/graphql/type-defs apps/hash-api/src/graphql/type-defs
COPY apps/hash-frontend/codegen.config.ts apps/hash-frontend/codegen.config.ts
COPY apps/hash-frontend/src/graphql/queries apps/hash-frontend/src/graphql/queries
COPY libs/@local/hash-isomorphic-utils/src/graphql libs/@local/hash-isomorphic-utils/src/graphql
COPY libs/@local/hash-isomorphic-utils/src/queries libs/@local/hash-isomorphic-utils/src/queries

RUN yarn workspace @apps/hash-frontend codegen

COPY libs/@local/hash-isomorphic-utils/codegen.config.ts libs/@local/hash-isomorphic-utils/codegen.config.ts

RUN yarn workspace @local/hash-isomorphic-utils codegen

COPY apps/hash-frontend apps/hash-frontend
COPY apps/hash-graph/clients/typescript apps/hash-graph/clients/typescript
COPY libs/@local/design-system libs/@local/design-system
COPY libs/@local/eslint-config libs/@local/eslint-config
COPY libs/@local/hash-isomorphic-utils libs/@local/hash-isomorphic-utils
COPY libs/@local/hash-subgraph libs/@local/hash-subgraph
COPY libs/@local/tsconfig libs/@local/tsconfig

WORKDIR /app/apps/hash-frontend
ENV NODE_ENV production
ARG API_ORIGIN
ENV API_ORIGIN ${API_ORIGIN}
ARG FRONTEND_URL
ENV FRONTEND_URL ${FRONTEND_URL}
ARG SYSTEM_ACCOUNT_NAME
ENV SYSTEM_ACCOUNT_NAME ${SYSTEM_ACCOUNT_NAME}
ARG SYSTEM_USER_SHORTNAME
ENV SYSTEM_USER_SHORTNAME ${SYSTEM_USER_SHORTNAME}
RUN yarn next build


#########################################################################################

FROM node:16.18.1-alpine

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder --chown=appgroup:appuser /app /app

# Nextjs needs permissions to create caches
RUN chown -R appuser:appgroup /app/apps/hash-frontend/.next
WORKDIR /app

USER appuser
ENV NODE_ENV production

CMD ["yarn", "workspace","@apps/hash-frontend", "start"]

