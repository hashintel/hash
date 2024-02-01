FROM node:18.15-slim AS base

WORKDIR /app

COPY package.json .
RUN apt-get update && \
    apt-get install -y --no-install-recommends jq && \
    rm -rf /var/lib/apt/lists/* && \
    yarn global add "turbo@$(jq -r '.devDependencies.turbo' < package.json)"
COPY . .
RUN turbo prune --scope='@apps/hash-ai-worker-ts' --docker

# Turbo isn't aware of our patches by default (it would be if we use Yarn 2+ or pnpm).
# Therefore we manually add the patches to the pruned output to allow for the patches to be applied.
COPY patches /app/out/full/patches

FROM node:18.15-slim as installer

WORKDIR /usr/local/src/

RUN apt-get update && apt-get install -y --no-install-recommends default-jre-headless && rm -rf /var/lib/apt/lists/*

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/patches patches

RUN yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=base /app/out/full/ .

RUN yarn turbo build --filter '@apps/hash-ai-worker-ts'

FROM node:18.15-slim as runner

COPY --from=installer /usr/local/src /usr/local/src
WORKDIR /usr/local/src/apps/hash-ai-worker-ts

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd --system --gid 60000 hash && \
    useradd --system tsworker -G hash && \
    install -d -m 0775 -o tsworker -g hash /log

USER tsworker:hash
ENV NODE_ENV production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:4100/health || exit 1
