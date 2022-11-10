FROM node:16.16.0-alpine AS builder

WORKDIR /app

# Required dependencies for compiling the re2 NPM package
RUN apk add --no-cache libc6-compat python3 make g++

# Ensure that the node module layer can be cached
COPY turbo.json .
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --prefer-offline --force --build-from-source

# explicitly build re2
# RUN yarn add --ignore-workspace-root-check --force --build-from-source re2@1.15.9


# Also ensure that api node modules can be cached
COPY libs/javascript/@local/tsconfig/package.json libs/javascript/@local/tsconfig/
COPY libs/javascript/@local/eslint-config/package.json libs/javascript/@local/eslint-config/
COPY packages/hash/frontend/package.json packages/hash/frontend/
COPY packages/hash/design-system/package.json packages/hash/design-system/
COPY packages/hash/shared/package.json packages/hash/shared/
COPY packages/graph/clients/typescript/package.json packages/graph/clients/typescript/
RUN yarn workspace @hashintel/hash-frontend install --frozen-lockfile --prefer-offline

COPY packages/hash/api/codegen.yml packages/hash/api/codegen.yml
COPY packages/hash/api/src/graphql/typeDefs packages/hash/api/src/graphql/typeDefs
COPY packages/hash/frontend/codegen.yml packages/hash/frontend/codegen.yml
COPY packages/hash/frontend/src/graphql/queries packages/hash/frontend/src/graphql/queries
COPY packages/hash/shared/src/queries packages/hash/shared/src/queries

RUN yarn workspace @hashintel/hash-frontend codegen

COPY packages/hash/shared/codegen.yml packages/hash/shared/codegen.yml
COPY packages/hash/shared/src/queries packages/hash/shared/src/queries

RUN yarn workspace @hashintel/hash-shared codegen

COPY libs/javascript/@local/tsconfig libs/javascript/@local/tsconfig
COPY libs/javascript/@local/eslint-config libs/javascript/@local/eslint-config
COPY packages/graph/clients/typescript packages/graph/clients/typescript
COPY packages/hash/frontend packages/hash/frontend
COPY packages/hash/design-system packages/hash/design-system
COPY packages/hash/shared packages/hash/shared

WORKDIR /app/packages/hash/frontend
ENV NODE_ENV production
RUN yarn next build


#########################################################################################

FROM node:16.16.0-alpine

COPY --from=builder /app /app

WORKDIR /app

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

USER root
RUN chown appuser:appgroup /app

USER appuser
ENV NODE_ENV production


CMD ["yarn", "workspace","@hashintel/hash-frontend", "start"]

