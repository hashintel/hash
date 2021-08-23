FROM node:16 AS builder

WORKDIR /app

# Copy the package.json files first and run yarn install.
# Copy the package.json files first and run yarn install.
COPY packages/hash/realtime/package.json packages/hash/realtime/package.json
COPY package.json .
COPY tsconfig.base.json .

RUN yarn ws:hash-realtime install

# Copy over the packages source now, after yarn install. This makes the build faster
# if no changes have been made to the package.json files.
# Copy over the packages source now, after yarn install. This makes the build faster
# if no changes have been made to the package.json files.
COPY packages/hash/realtime packages/hash/realtime
COPY packages/hash/prettier-config packages/hash/prettier-config

RUN yarn ws:hash-realtime build \
  # Remove devDependencies
  && yarn ws:hash-realtime install --production --ignore-scripts --prefer-offline

#########################################################################################

FROM ubuntu:20.04

COPY --from=builder /app /app
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Run as a non-root user
RUN groupadd -g 999 appuser \
  && useradd -r -u 999 -g appuser appuser

USER appuser

ENTRYPOINT ["node", "packages/hash/realtime/dist/index.js"]
