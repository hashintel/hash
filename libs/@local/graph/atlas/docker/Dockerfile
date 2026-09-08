# syntax=docker/dockerfile:1

ARG CUDA_VERSION=12.8.1
ARG UBUNTU_VERSION=24.04

FROM debian:13.3-slim AS mise

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_NODE_COREPACK=1
ENV PATH="/mise/shims:$PATH"

COPY .config/mise /etc/mise

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    /etc/mise/install.sh && \
    mise --version && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    eval "$(mise activate bash)" && \
    mise install --locked node


FROM mise AS base

WORKDIR /app

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    mise install --locked npm:turbo yq

COPY . .
# `turbo prune` does not include Cargo workspaces, so we create dummy projects for each workspace member
RUN mise trust && \
    turbo prune $(.github/scripts/prune-scopes.sh '@rust/hash-graph-atlas') --docker && \
    find $(yq '.workspace.members' -o tsv Cargo.toml | tr '*' ' ') -maxdepth 2 -name Cargo.toml -exec sh -c ' \
    [ -f "/app/out/full/$1" ] || ( \
    mkdir -p "/app/out/full/$(dirname "$1")/src" &&  \
    echo > "/app/out/full/$(dirname "$1")/src/lib.rs" &&  \
    printf "[package]\nname = \"$(yq ".package.name" -p toml -oy $1)\"" > "/app/out/full/$1" \
    )' _ {} \; && \
    cp -R .cargo Cargo.toml Cargo.lock /app/out/full/


# We use the explicit version here, as `nvcc` determines the version, and if absent chooses the newest toolkit known.
FROM nvidia/cuda:${CUDA_VERSION}-devel-ubuntu${UBUNTU_VERSION} AS rust

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

WORKDIR /usr/local/

ENV MISE_DATA_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_CARGO_HOME="/usr/local/cargo"
ENV PATH="/mise/shims:/usr/local/cargo/bin:$PATH"

COPY .config/mise /etc/mise
COPY rust-toolchain.toml .

RUN --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates build-essential && \
    /etc/mise/install.sh && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    eval "$(mise activate bash)" && \
    mise install --locked yq protoc && \
    echo "Installing Rust toolchain: $(yq '.toolchain.channel' rust-toolchain.toml)" && \
    mise use --global rust[profile=minimal]@$(yq '.toolchain.channel' rust-toolchain.toml) && \
    rustc --version && \
    cargo --version && \
    nvcc --version && \
    rm rust-toolchain.toml


FROM rust AS builder

WORKDIR /usr/local/src/

COPY --from=base /app/out/full/ .

ARG PROFILE=production

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/local/src/target,sharing=locked \
    if [[ ${PROFILE} == dev ]]; then \
    export RUSTFLAGS="-C debuginfo=line-tables-only" && \
    export PROFILE=dev-llvm; \
    fi && \
    cargo install --path libs/@local/graph/atlas --features cli --root /tmp --profile $PROFILE --locked && \
    install -D -m 0755 /tmp/bin/hash-graph-atlas /out/usr/local/bin/hash-graph-atlas


# Minimal version, that excludes everything except the requirements for the fit to run.
# The `runtime` image would add cuBLAS, cuFFT, cuSPARSE, cuSOLVER and NPP.
# This extra installation step saves about 2 GB.
FROM nvidia/cuda:${CUDA_VERSION}-base-ubuntu${UBUNTU_VERSION} AS runner

ARG CUDA_VERSION

SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

# The fit runs as `61000:60000`, same as the graph image.
RUN cuda="${CUDA_VERSION%.*}" && \
    cuda="${cuda/./-}" && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    "cuda-nvrtc-${cuda}" "cuda-cudart-dev-${cuda}" "cuda-cccl-${cuda}" && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    ldconfig && \
    groupadd --gid 60000 hash && \
    useradd --uid 61000 --gid 60000 --no-create-home --home-dir / --shell /usr/sbin/nologin atlas && \
    install -d -m 0775 -o 61000 -g 60000 /atlas-generations

COPY --from=builder /out/ /

ENV HASH_GRAPH_ATLAS_ROOT="/atlas-generations"

USER atlas:hash

ENTRYPOINT ["/usr/local/bin/hash-graph-atlas"]
