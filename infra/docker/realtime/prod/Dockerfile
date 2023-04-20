FROM node:16.18.1-alpine AS base

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-realtime' --docker

FROM node:16.18.1-alpine as installer


WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/turbo.json turbo.json

RUN yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=base /app/out/full/ .

FROM node:16.18.1-alpine as runner

COPY --from=installer /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-realtime

ENTRYPOINT [ "yarn" ]
CMD ["start"]

# Run as a non-root user
RUN addgroup --system --gid 60000 hash \
    && adduser --system realtime -G hash

USER realtime:hash
ENV NODE_ENV production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost${HASH_REALTIME_PORT:-3333}/health || exit 1
