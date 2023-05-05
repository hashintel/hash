FROM node:16.18.1-slim AS base

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-ai-worker-ts' --docker

FROM node:16.18.1-slim as installer


WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock

RUN yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=base /app/out/full/ .

RUN yarn turbo build --filter '@apps/hash-ai-worker-ts'

FROM node:16.18.1-slim as runner

COPY --from=installer /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-ai-worker-ts

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

# Run as a non-root user
RUN groupadd --system --gid 60000 hash \
    && useradd --system worker -g hash

USER worker:hash
ENV NODE_ENV production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:4100/health || exit 1
