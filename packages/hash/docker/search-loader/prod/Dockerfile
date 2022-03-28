FROM node:16.14.2-alpine AS builder

WORKDIR /app

COPY packages/hash/api packages/hash/api
COPY packages/hash/shared packages/hash/shared
COPY packages/hash/backend-utils packages/hash/backend-utils
COPY packages/hash/search-loader packages/hash/search-loader
COPY packages/hash/shared packages/hash/shared
COPY package.json .
COPY tsconfig.base.json .
COPY yarn.lock .

RUN --mount=type=cache,mode=0755,target=/yarn-cache \
  --mount=type=cache,mode=0755,target=/var/cache/apt \
  --mount=type=cache,mode=0755,target=/var/lib/apt \
  yarn workspace @hashintel/hash-search-loader install \
  && yarn workspace @hashintel/hash-search-loader install --production --ignore-scripts --prefer-offline # Remove devDependencies

#########################################################################################

FROM node:16.14.2-alpine

COPY --from=builder /app /app

WORKDIR /app

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

USER root
RUN chown appuser:appgroup /app

USER appuser
ENV NODE_ENV production

CMD ["yarn", "workspace","@hashintel/hash-search-loader", "start"]
