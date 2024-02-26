FROM node:18.15-alpine AS builder

WORKDIR /app

COPY package.json .
RUN apk add --no-cache jq && yarn global add "turbo@$(jq -r '.devDependencies.turbo' < package.json)"
COPY . .
RUN turbo prune --scope='@apps/hash-api' --docker
# Turbo isn't aware of our patches by default (it would be if we use Yarn 2+ or pnpm).
# Therefore we manually add the patches to the pruned output to allow for the patches to be applied.
COPY patches /app/out/full/patches


FROM builder AS installer

WORKDIR /usr/local/src/hash

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock yarn.lock
COPY --from=builder /app/out/full/patches patches

RUN yarn config set network-timeout 300000 && \
    yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=builder /app/out/full/ .

RUN apk add --no-cache openjdk17-jre

ENV NODE_ENV production

RUN yarn turbo build --filter '@apps/hash-api'


FROM node:18.15-alpine AS runner

RUN apk add --no-cache curl

COPY --from=installer /usr/local/src/hash /usr/local/src/hash
WORKDIR /usr/local/src/hash/apps/hash-api
RUN mkdir -p /usr/local/src/hash/var/uploads

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

# Run as a non-root user
RUN addgroup --system --gid 60000 hash \
    && adduser --system --ingroup hash api

USER api:hash
ENV NODE_ENV production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:5001/health-check || exit 1
