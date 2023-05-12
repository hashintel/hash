FROM python:3.11.3-slim-bullseye as python-base

FROM node:18.15-bullseye-slim AS base

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
    apt-get install -y --no-install-recommends build-essential libffi-dev curl

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

RUN yarn global add turbo


FROM base as pruned

WORKDIR /app

COPY . .
RUN turbo prune --scope='@apps/hash-agents' --docker


FROM base as venv-installer

ENV REPO_ROOT="/usr/local/src/hash"
ENV APP_ROOT="$REPO_ROOT/apps/hash-agents"

WORKDIR $REPO_ROOT

COPY --from=pruned /app/out/json/ .
COPY --from=pruned /app/out/yarn.lock .
COPY --from=pruned /app/turbo.json .

WORKDIR $APP_ROOT

COPY --from=pruned /app/out/full/apps/hash-agents/turbo.json .
COPY --from=pruned /app/out/full/apps/hash-agents/package.json .
COPY --from=pruned /app/out/full/apps/hash-agents/pyproject.toml .
COPY --from=pruned /app/out/full/apps/hash-agents/poetry.toml .
COPY --from=pruned /app/out/full/apps/hash-agents/poetry.lock .

RUN poetry env use python3

WORKDIR $REPO_ROOT

RUN turbo poetry:install-production

RUN apt-get remove -y build-essential libffi-dev && \
    apt-get autoremove -y


FROM venv-installer as yarn-installer

WORKDIR $REPO_ROOT

RUN yarn install --frozen-lockfile --prefer-offline && \
    yarn cache clean

COPY --from=pruned /app/out/full/ .

RUN turbo codegen --filter '@apps/hash-agents'

FROM python-base AS runner

ENV VIRTUAL_ENV=".venv"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

COPY --from=yarn-installer /usr/local/src/hash/ /usr/local/src/hash

WORKDIR "/usr/local/src/hash/apps/hash-agents"

RUN . .venv/bin/activate

ENTRYPOINT ["gunicorn"]
CMD ["-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:80", "--timeout", "0", "app:create_app('prod')"]
EXPOSE 80

RUN apt-get update && \
    apt-get install -y curl && \
    groupadd --system --gid 60000 hash && \
    useradd --system agents -G hash && \
    install -d -m 0775 -o agents -g hash /log

USER agents:hash

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 CMD curl -f http://localhost/health || exit 1
