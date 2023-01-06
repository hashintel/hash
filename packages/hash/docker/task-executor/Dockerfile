FROM node:16.18.1-alpine AS builder

WORKDIR /app

# Ensure that the node module layer can be cached
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

COPY libs/javascript/@local/tsconfig/* libs/javascript/@local/tsconfig/
COPY libs/javascript/@local/eslint-config/package.json libs/javascript/@local/eslint-config/
COPY packages/hash/task-executor packages/hash/task-executor

RUN yarn workspace @hashintel/hash-task-executor install --ignore-scripts --prefer-offline

  #########################################################################################

FROM node:16.18.1-alpine

COPY --from=builder /app /app

# Install python/pip
ENV PYTHONUNBUFFERED=1
RUN apk add --update --no-cache python3 && ln -sf python3 /usr/bin/python
RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools

# Install docker
RUN apk add --update docker openrc
RUN rc-update add docker boot

WORKDIR /app

EXPOSE 5010
ENV NODE_ENV production

CMD ["yarn", "workspace", "@hashintel/hash-task-executor", "start"]
