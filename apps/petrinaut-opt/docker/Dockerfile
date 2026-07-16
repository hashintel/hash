# syntax=docker/dockerfile:1

# Build from the repository root:
# docker build -f apps/petrinaut-opt/docker/Dockerfile .

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.13
ARG TURBO_VERSION=2.6.3
ARG UV_VERSION=0.11.18


FROM node:${NODE_VERSION}-bookworm-slim AS cli-pruner

ARG TURBO_VERSION

WORKDIR /repo

RUN npm install --global "turbo@${TURBO_VERSION}"

COPY . .

RUN turbo prune @hashintel/petrinaut-cli --docker


FROM node:${NODE_VERSION}-bookworm-slim AS cli-builder

ARG TURBO_VERSION

WORKDIR /repo

RUN corepack enable && \
    npm install --global "turbo@${TURBO_VERSION}"

# Install from dependency manifests first so source changes do not invalidate
# the dependency layer.
COPY --from=cli-pruner /repo/out/json/ ./
COPY --from=cli-pruner /repo/out/yarn.lock ./yarn.lock
COPY --from=cli-pruner /repo/out/full/.yarn ./.yarn
COPY --from=cli-pruner /repo/out/full/turbo.json ./turbo.json

RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    yarn install --immutable

COPY --from=cli-pruner /repo/out/full/ ./

RUN yarn workspace @hashintel/petrinaut-core build && \
    yarn workspace @hashintel/petrinaut-cli build && \
    yarn workspaces focus @hashintel/petrinaut-cli --production && \
    find \
      libs/@hashintel/petrinaut-core/dist \
      libs/@hashintel/petrinaut-cli/dist \
      -type f \( -name "*.d.ts" -o -name "*.map" \) -delete


FROM scratch AS cli-runtime

COPY --from=cli-builder /repo/node_modules /node_modules
COPY --from=cli-builder /repo/libs/@hashintel/petrinaut-core/package.json /libs/@hashintel/petrinaut-core/package.json
COPY --from=cli-builder /repo/libs/@hashintel/petrinaut-core/dist /libs/@hashintel/petrinaut-core/dist
COPY --from=cli-builder /repo/libs/@hashintel/petrinaut-cli/package.json /libs/@hashintel/petrinaut-cli/package.json
COPY --from=cli-builder /repo/libs/@hashintel/petrinaut-cli/dist /libs/@hashintel/petrinaut-cli/dist
COPY --from=cli-builder /repo/libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json /libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json


FROM node:${NODE_VERSION}-bookworm-slim AS node-runtime


FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv


FROM python:${PYTHON_VERSION}-slim-bookworm AS python-deps

ENV PATH="/opt/venv/bin:${PATH}" \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app

COPY --from=uv /uv /usr/local/bin/uv

# Install locked Python dependencies independently from the application source
# for better layer caching. The project itself is imported directly from /app.
COPY apps/petrinaut-opt/pyproject.toml apps/petrinaut-opt/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project


FROM python:${PYTHON_VERSION}-slim-bookworm AS runner

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_OPTIONS="--permission --allow-fs-read=/opt/petrinaut-cli --allow-fs-read=/usr/local/bin/petrinaut --disable-proto=throw --max-old-space-size=768 --no-addons --no-global-search-paths" \
    PETRINAUT_CLI_NODE_OPTIONS="--permission --allow-fs-read=/opt/petrinaut-cli --allow-fs-read=/usr/local/bin/petrinaut --disable-proto=throw --max-old-space-size=768 --no-addons --no-global-search-paths"

WORKDIR /app

# Node is the only runtime from the Node image needed by the compiled CLI.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=python-deps /opt/venv /opt/venv

COPY apps/petrinaut-opt/src ./src

# Import the prepared CLI filesystem as one runtime artifact. It contains only
# the focused production dependency graph and the two built workspace packages.
COPY --from=cli-runtime / /opt/petrinaut-cli

RUN chmod +x /opt/petrinaut-cli/libs/@hashintel/petrinaut-cli/dist/cli.js && \
    ln -s /opt/petrinaut-cli/libs /libs && \
    ln -s /opt/petrinaut-cli/libs/@hashintel/petrinaut-cli/dist/cli.js /usr/local/bin/petrinaut && \
    groupadd --system petrinaut && \
    useradd --system --gid petrinaut --create-home petrinaut

USER petrinaut

EXPOSE 4004

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:4004/status', timeout=4).close()"]

CMD ["python", "-m", "uvicorn", "src.optimization_api:app", "--host", "0.0.0.0", "--port", "4004"]
