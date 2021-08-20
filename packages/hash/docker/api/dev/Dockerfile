FROM node:16

WORKDIR /app

# Copy the package.json files first and run yarn install.
COPY packages/hash/backend/package.json packages/hash/backend/package.json
COPY packages/hash/shared packages/hash/shared
COPY packages/hash/frontend packages/hash/frontend
COPY packages/hash/block-protocol packages/hash/block-protocol
COPY packages/hash/prettier-config/package.json packages/hash/prettier-config/package.json
COPY package.json .
COPY tsconfig.json .
COPY tsconfig.base.json .
COPY yarn.lock .
COPY packages/hash/docker/api/dev/start.sh .

RUN apt-get update \
    && apt-get install wait-for-it \
    && chmod +x start.sh \
    && yarn install

# Copy over the packages source now, after yarn install. This makes the build faster
# if no changes have been made to the package.json files.
COPY packages/hash/backend packages/hash/backend
COPY packages/hash/prettier-config packages/hash/prettier-config
