FROM node:18.15-slim AS base

WORKDIR /app

COPY package.json .
RUN yarn global add "turbo@$(jq -r '.devDependencies.turbo' < package.json)"
COPY . .
RUN turbo prune --scope='@apps/hash-integration-worker' --docker

FROM node:18.15-slim as installer

WORKDIR /usr/local/src/

RUN apt-get update && apt-get install -y --no-install-recommends default-jre-headless && rm -rf /var/lib/apt/lists/*

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock

RUN yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=base /app/out/full/ .

RUN yarn turbo build --filter '@apps/hash-integration-worker'

FROM node:18.15-slim as runner

COPY --from=installer /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-integration-worker

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --system --gid 60000 hash && \
    useradd --system integrationworker -G hash && \
    install -d -m 0775 -o integrationworker -g hash /log

USER integrationworker:hash
ENV NODE_ENV production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:4300/health || exit 1
