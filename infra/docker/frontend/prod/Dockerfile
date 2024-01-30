FROM node:18.15-alpine AS builder

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-frontend' --docker
# Turbo isn't aware of our patches by default (it would be if we use Yarn 2+ or pnpm).
# Therefore we manually add the patches to the pruned output to allow for the patches to be applied.
COPY patches /app/out/full/patches


FROM builder as installer

WORKDIR /usr/local/src/hash

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock yarn.lock
COPY --from=builder /app/out/full/patches patches

# Required dependencies for compiling the re2 NPM package
RUN apk add --no-cache libc6-compat python3 make g++ linux-headers

RUN yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=builder /app/out/full/ .

RUN apk add --no-cache openjdk17-jre

ENV NODE_ENV production
ARG API_ORIGIN
ENV API_ORIGIN ${API_ORIGIN}
ARG FRONTEND_URL
ENV FRONTEND_URL ${FRONTEND_URL}

RUN turbo build --filter '@apps/hash-frontend'


FROM node:18.15-alpine

RUN #apk add --no-cache libc6-compat

COPY --from=installer /usr/local/src/hash /usr/local/src/hash
WORKDIR /usr/local/src/hash/apps/hash-frontend

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

# Run as a non-root user
RUN addgroup --system --gid 60000 hash \
    && adduser --system --ingroup hash frontend

# Nextjs needs permissions to create caches
RUN chown -R frontend:hash .next

USER frontend:hash
ENV NODE_ENV production
