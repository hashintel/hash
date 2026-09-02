# syntax=docker/dockerfile:1

# Build from the repository root:
# docker build -f apps/petrinaut-opt/docker/Dockerfile .

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.13
ARG UV_VERSION=0.11.18


FROM node:${NODE_VERSION}-bookworm-slim AS bindings-tools

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV PATH="/mise/shims:$PATH"

COPY .config/mise /etc/mise

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    /etc/mise/install.sh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    mise install --locked npm:turbo yq


FROM bindings-tools AS bindings-pruner

WORKDIR /repo

COPY . .

RUN mise trust && \
    turbo prune $(.github/scripts/prune-scopes.sh '@local/petrinaut-python') --docker


FROM bindings-tools AS bindings-builder

WORKDIR /repo

RUN corepack enable

# Install from dependency manifests first so source changes do not invalidate
# the dependency layer.
COPY --from=bindings-pruner /repo/out/json/ ./
COPY --from=bindings-pruner /repo/out/yarn.lock ./yarn.lock
COPY --from=bindings-pruner /repo/out/full/.yarn ./.yarn
COPY --from=bindings-pruner /repo/out/full/turbo.json ./turbo.json

RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn install --immutable

COPY --from=bindings-pruner /repo/out/full/ ./

# The bindings declare their executable as a dependency, so building their
# dependency closure pulls in whatever provides it; this service names no
# package. `^...` selects the dependencies only: the bindings themselves have
# nothing to build here, and their codegen needs uv, which this stage lacks.
RUN turbo run build --filter '@local/petrinaut-python^...' && \
    yarn workspaces focus @local/petrinaut-python --production && \
    find libs -mindepth 3 -maxdepth 3 -type d \
      \( -name src -o -name tests -o -name test-fixtures \) \
      -exec rm -rf {} + && \
    find libs -type f \( -name "*.d.ts" -o -name "*.map" \) -delete


FROM scratch AS bindings-runtime

COPY --from=bindings-builder /repo/node_modules /node_modules
COPY --from=bindings-builder /repo/libs /libs


FROM node:${NODE_VERSION}-bookworm-slim AS node-runtime


FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv


FROM python:${PYTHON_VERSION}-slim-bookworm AS python-deps

ENV PATH="/opt/venv/bin:${PATH}" \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /repo/apps/petrinaut-opt

COPY --from=uv /uv /usr/local/bin/uv

# Installs dependencies before the service's own source, so editing `src/`
# reuses this layer. Editing the bindings does rebuild it, since they are part
# of the environment. `--no-editable` builds them into the virtualenv, so the
# runner needs the virtualenv alone and no source tree at a matching path.
COPY apps/petrinaut-opt/pyproject.toml apps/petrinaut-opt/uv.lock ./
COPY libs/@local/petrinaut-python /repo/libs/@local/petrinaut-python
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --no-editable


FROM python:${PYTHON_VERSION}-slim-bookworm AS runner

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PETRINAUT_CHILD_NODE_OPTIONS="--permission --allow-fs-read=/opt/petrinaut-runtime --allow-fs-read=/usr/local/bin/petrinaut --disable-proto=throw --max-old-space-size=768 --no-addons --no-global-search-paths"

WORKDIR /app

# Node is what the bindings' executable runs on today.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=python-deps /opt/venv /opt/venv

COPY apps/petrinaut-opt/src ./src

# The bindings' runtime: their focused production dependency graph and the
# built workspace packages it resolves.
COPY --from=bindings-runtime / /opt/petrinaut-runtime

# `petrinaut` is the command the bindings spawn by default, and they give the
# child a fixed PATH of /usr/local/bin:/usr/bin:/bin, so it is linked there.
RUN chmod +x /opt/petrinaut-runtime/node_modules/.bin/petrinaut && \
    ln -s /opt/petrinaut-runtime/libs /libs && \
    ln -s /opt/petrinaut-runtime/node_modules/.bin/petrinaut /usr/local/bin/petrinaut && \
    groupadd --system petrinaut && \
    useradd --system --gid petrinaut --create-home petrinaut

USER petrinaut

EXPOSE 4004

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:4004/health', timeout=4).close()"]

CMD ["python", "-m", "uvicorn", "src.optimization_api:app", "--host", "0.0.0.0", "--port", "4004"]
