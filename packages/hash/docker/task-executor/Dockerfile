FROM node:16.18.1-alpine AS builder

WORKDIR /app

COPY libs/@local/tsconfig libs/@local/tsconfig
COPY packages/hash/task-executor packages/hash/task-executor
COPY package.json .
COPY yarn.lock .

RUN --mount=type=cache,mode=0755,target=/yarn-cache \
  --mount=type=cache,mode=0755,target=/var/cache/apt \
  --mount=type=cache,mode=0755,target=/var/lib/apt \
  yarn workspace @hashintel/hash-task-executor install --cache-folder /yarn-cache \
  && yarn install --production --ignore-scripts --prefer-offline --cache-folder /yarn-cache # Remove devDependencies

  #########################################################################################

FROM node:16.18.1-alpine

COPY --from=builder /app /app

# Install python/pip
ENV PYTHONUNBUFFERED=1
RUN apk add --update --no-cache python3 && ln -sf python3 /usr/bin/python
RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools

WORKDIR /app

EXPOSE 5010
ENV NODE_ENV production

CMD ["yarn", "workspace", "@hashintel/hash-task-executor", "start"]
