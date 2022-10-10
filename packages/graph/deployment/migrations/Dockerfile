FROM node:18.7.0-alpine3.16

COPY migrations/ /migrations/

WORKDIR /migrations
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install

ENTRYPOINT ["yarn", "graph:migrate", "up"]
