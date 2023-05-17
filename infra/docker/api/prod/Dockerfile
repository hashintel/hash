FROM python:3.11.3-slim-bullseye as python-base

FROM node:18.15-slim AS pruned

WORKDIR /app

RUN yarn global add turbo
COPY . .
RUN turbo prune --scope='@apps/hash-api' --docker

FROM pruned as installer

WORKDIR /usr/local/src/hash

COPY --from=pruned /app/out/json/ .
COPY --from=pruned /app/out/yarn.lock ./yarn.lock

RUN yarn install --frozen-lockfile --prefer-offline \
    && yarn cache clean

COPY --from=pruned /app/out/full/ .

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

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential libffi-dev curl default-jre

# `apt-get install python3` installs an older version of Python and we want 3.11, copying it from the official image
#   seems to work with just these commands, so we opt to do this rather than needing to build it from source or
#   install it from an external source such as https://github.com/indygreg/python-build-standalone (see frontend vercel-install)
#   if this causes problem, or we update dependencies, we can change approach.

COPY --from=python-base /usr/local/bin/python3 /usr/local/bin/python3
COPY --from=python-base /usr/local/bin/python3.11 /usr/local/bin/python3.11
COPY --from=python-base /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=python-base /usr/local/lib/libpython3.so /usr/local/lib/libpython3.so
COPY --from=python-base /usr/local/lib/libpython3.11.so /usr/local/lib/libpython3.11.so
COPY --from=python-base /usr/local/lib/libpython3.11.so.1.0 /usr/local/lib/libpython3.11.so.1.0

RUN apt-get install -y python-is-python3

RUN curl -sSL https://install.python-poetry.org | python3 -

RUN yarn turbo codegen --filter '@apps/hash-api'

FROM node:18.15-slim as runner

RUN apt update && apt install -y curl

COPY --from=installer /usr/local/src/hash /usr/local/src/hash
WORKDIR /usr/local/src/hash/apps/hash-api
RUN mkdir -p /usr/local/src/hash/var/uploads

ENTRYPOINT [ "yarn", "--cache-folder", "/tmp/yarn-cache", "--global-folder", "/tmp/yarn-global" ]
CMD ["start"]

# Run as a non-root user
RUN groupadd --system --gid 60000 hash \
    && useradd --system api -g hash

USER api:hash
ENV NODE_ENV production

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost:5001 || exit 1
