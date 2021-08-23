FROM node:16

WORKDIR /app

# Copy the package.json files first and run yarn install.
COPY packages/hash/realtime/package.json packages/hash/realtime/package.json
COPY package.json .
COPY tsconfig.base.json .

RUN yarn ws:hash-realtime install

# Copy over the packages source now, after yarn install. This makes the build faster
# if no changes have been made to the package.json files.
COPY packages/hash/realtime packages/hash/realtime
COPY packages/hash/prettier-config packages/hash/prettier-config


ENTRYPOINT [ "yarn", "ws:hash-realtime", "dev" ]
