FROM node:16.18.1-alpine AS base

RUN apk --no-cache add python3 python3-dev --repository=https://dl-cdn.alpinelinux.org/alpine/edge/main

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    POETRY_ACTIVE=1 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    POETRY_VERSION=1.4.2
ENV VIRTUAL_ENV=".venv"
ENV PATH="$POETRY_HOME/bin:$VIRTUAL_ENV/bin:$PATH"

RUN apk add --no-cache --virtual .build-deps g++ musl-dev libffi-dev make curl && \
    curl -sSL https://install.python-poetry.org | python


FROM base as pruned

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-agents' --docker


FROM base as venv-installer

WORKDIR /usr/local/src/hash/

COPY --from=pruned /app/out/json/ .
COPY --from=pruned /app/out/yarn.lock ./yarn.lock

WORKDIR /usr/local/src/hash/apps/hash-agents

COPY --from=pruned /app/out/full/apps/hash-agents/poetry.lock .
COPY --from=pruned /app/out/full/apps/hash-agents/pyproject.toml .

RUN poetry install --no-root --only main --only production

RUN apk del .build-deps

FROM venv-installer as yarn-installer

WORKDIR /usr/local/src/hash/

RUN yarn install --frozen-lockfile --prefer-offline && \
    yarn cache clean

COPY --from=pruned /app/out/full/ .

RUN yarn turbo build --filter '@apps/hash-agents'


FROM alpine AS runner

WORKDIR "/usr/local/src/hash/apps/hash-agents"


COPY --from=yarn-installer /usr/local/src/hash/ app

RUN . app/apps/hash-agents/.venv/bin/activate


ENTRYPOINT ["gunicorn"]
CMD ["-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:80", "--timeout", "0", "app:create_app('prod')"]
EXPOSE 80

RUN apk add --no-cache curl && \
    addgroup --system --gid 60000 hash && \
    adduser --system agents -G hash && \
    install -d -m 0775 -o agents -g hash /log

USER agents:hash

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost/health || exit 1
