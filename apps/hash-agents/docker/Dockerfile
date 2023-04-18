FROM node:16.18.1-alpine AS base

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-agents' --docker



FROM node:16.18.1-alpine as installer

WORKDIR /usr/local/src/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/turbo.json turbo.json

RUN yarn install --frozen-lockfile --prefer-offline && \
    yarn cache clean

COPY --from=base /app/out/full/ .


FROM installer AS builder

WORKDIR /usr/local/src/apps/hash-agents

RUN yarn build


FROM python:3.11-alpine as runner

RUN apk add --no-cache g++ musl-dev python3-dev libffi-dev make curl

WORKDIR /usr/local/src/apps/hash-agents

COPY --from=builder /usr/local/src/apps/hash-agents/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install -r requirements.txt

COPY --from=builder /usr/local/src/apps/hash-agents .

ENTRYPOINT ["gunicorn"]
CMD ["-k", "gevent", "-b", "0.0.0.0:80", "app:create_app(base_logger='gunicorn.error')"]

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost/health || exit 1
