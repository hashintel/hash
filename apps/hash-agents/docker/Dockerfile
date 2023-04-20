FROM node:16.18.1-alpine AS base

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-agents' --docker



FROM node:16.18.1-alpine as installer

WORKDIR /usr/local/src/hash/

COPY --from=base /app/out/json/ .
COPY --from=base /app/out/yarn.lock ./yarn.lock
COPY --from=base /app/out/full/turbo.json turbo.json

RUN yarn install --frozen-lockfile --prefer-offline && \
    yarn cache clean

COPY --from=base /app/out/full/ .


FROM python:3.11-alpine as base-env

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1 \
    WORKDIR="/usr/local/src/hash/apps/hash-agents"
ENV VENV_DIR="$WORKDIR/.venv"
ENV PATH="$POETRY_HOME/bin:$VENV_DIR/bin:$PATH"

WORKDIR $WORKDIR


FROM base-env AS builder

COPY --from=installer $WORKDIR/poetry.lock $WORKDIR/pyproject.toml ./

# install poetry
RUN apk add --no-cache --virtual .build-deps g++ musl-dev libffi-dev make curl && \
    curl -sSL https://install.python-poetry.org | python && \
    poetry install --no-root --only main && \
    poetry add 'gunicorn[gevent]' && \
    apk del .build-deps


FROM base-env AS runner

WORKDIR $WORKDIR

COPY --from=builder $VENV_DIR $VENV_DIR
COPY --from=installer $WORKDIR/app app
COPY --from=installer $WORKDIR/pyproject.toml ./

ENTRYPOINT ["gunicorn"]
CMD ["-k", "gevent", "-b", "0.0.0.0:80", "app:create_app(base_logger='gunicorn.error')"]
EXPOSE 80

RUN addgroup --system --gid 60000 hash && \
    adduser --system agents -G hash && \
    install -d -m 0775 -o agents -g hash /log

USER agents:hash

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost/health || exit 1
