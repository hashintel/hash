FROM node:18.7.0-alpine3.16

COPY migrations/ /migrations/

WORKDIR /migrations

## Install dependencies without resolving devDependencies
## Context: https://github.com/yarnpkg/yarn/issues/3630#issuecomment-641959126
RUN apk add --no-cache jq && \
  jq 'del(.devDependencies)' package.json > package.json.tmp && \
  mv package.json.tmp package.json

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install

ENTRYPOINT ["yarn", "graph:migrate", "up"]
