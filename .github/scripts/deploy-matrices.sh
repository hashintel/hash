#!/usr/bin/env bash
# Writes the matrices of the Deploy workflow to $GITHUB_OUTPUT: `sourcemaps`
# (the packages affected for `sentry:sourcemaps`), `backend-images` (one entry
# per service and arch to build) and `backend-manifests` (the services that
# publish a multi-arch manifest to GHCR).
#
# IS_DISPATCH=true selects every service of the catalog, otherwise only the
# affected ones. SKIP_AMD64=true leaves out amd64 where arm64 covers the build.

# Without pipefail a failing command piped into jq is masked by jq's
# exit 0 on empty input — yielding an empty matrix and a green run
# that silently builds/deploys nothing. Fail loud instead.
set -euo pipefail

SOURCEMAPS_PACKAGES=$(.github/scripts/affected-packages.sh sentry:sourcemaps)

echo "sourcemaps=$SOURCEMAPS_PACKAGES" | tee -a "$GITHUB_OUTPUT"

# Service catalog: the single source of truth for build/manifest.
# App images are detected via turbo's affected-package query (`package`,
# dependency-aware — a shared-lib change rebuilds its dependents). Kratos
# and Hydra aren't JS packages so turbo can't see them; their image
# context is their own directory, so a git diff of `paths` is a complete
# change signal. `arches` lists what to build; it defaults to both for
# GHCR services (multi-arch manifest) and to arm64 otherwise.
# ECR holds one architecture per repository (Inspector does not scan
# manifest lists): the service's only arch when it builds one, else
# arm64, unless `ecr_arch` says otherwise.
CATALOG=$(jq -nc '[
  {
    package:    "hash-graph",
    service:    "graph",
    push:       ["ecr", "ghcr"],
    dockerfile: "apps/hash-graph/docker/Dockerfile",
    context:    "."
  },
  {
    package:    "@apps/hash-api",
    service:    "api",
    push:       ["ecr", "ghcr"],
    dockerfile: "apps/hash-api/docker/Dockerfile",
    context:    "."
  },
  {
    package:    "@apps/hash-frontend",
    service:    "frontend",
    push:       ["ecr", "ghcr"],
    dockerfile: "apps/hash-frontend/docker/Dockerfile",
    context:    ".",
    # TODO(FE-752): drop build_args once frontend is runtime-configurable.
    build_args: "API_ORIGIN=http://localhost:5001\nFRONTEND_URL=http://localhost:3000\n"
  },
  {
    package:    "@apps/brunch-agent",
    service:    "brunch-agent",
    push:       ["ecr", "ghcr"],
    dockerfile: "apps/brunch-agent/docker/Dockerfile",
    context:    "."
  },
  {
    package:    "@apps/hash-ai-worker-ts",
    service:    "ai-worker-ts",
    push:       ["ecr", "ghcr"],
    dockerfile: "apps/hash-ai-worker-ts/docker/Dockerfile",
    context:    "."
  },
  {
    package:    "@apps/hash-integration-worker",
    service:    "integration-worker",
    push:       ["ecr", "ghcr"],
    dockerfile: "apps/hash-integration-worker/docker/Dockerfile",
    context:    "."
  },
  {
    package:    "hash-graph-atlas",
    service:    "atlas-fit",
    push:       ["ecr", "ghcr"],
    # The fit runs on x86 GPU hosts, so this image is amd64 rather than
    # the arm64 default; with one arch listed it is also the ECR arch.
    arches:     ["amd64"],
    dockerfile: "libs/@local/graph/atlas/docker/Dockerfile",
    context:    "."
  },
  {
    service:    "kratos",
    push:       ["ecr"],
    dockerfile: "infra/compose/kratos/Dockerfile",
    context:    "infra/compose/kratos",
    paths:      ["infra/compose/kratos"]
  },
  {
    service:    "hydra",
    push:       ["ecr"],
    dockerfile: "infra/compose/hydra/Dockerfile",
    context:    "infra/compose/hydra",
    paths:      ["infra/compose/hydra"]
  }
]')

# workflow_dispatch rebuilds everything (manual re-trigger). Otherwise
# filter to the affected set: app packages via turbo (dependency
# aware), infra services via a git diff of their context dir.
if [[ "$IS_DISPATCH" == "true" ]]; then
  AFFECTED_CATALOG=$(jq -c '.' <<<"$CATALOG")
else
  # App images — turbo affected.
  AFFECTED_PKGS=$(.github/scripts/affected-packages.sh build:docker | jq -c '[.include[].name]')

  # Fail loudly if turbo flags a `build:docker` package the catalog
  # doesn't know about — otherwise its image would silently never
  # publish. (Infra services aren't turbo packages, so they never
  # appear here.)
  MISSING=$(jq -nc --argjson pkgs "$AFFECTED_PKGS" --argjson catalog "$CATALOG" \
    '[$pkgs[] | select(. as $p | ($catalog | map(.package) | index($p)) | not)]')
  if [[ "$(jq length <<<"$MISSING")" -gt 0 ]]; then
    echo "::error ::affected build:docker packages missing from deploy catalog: $MISSING"
    exit 1
  fi

  # Infra images — turbo is blind to them; a changed file under their
  # context dir is a complete signal (the dir IS the build context).
  # Write the path list to a file: on large PR merge checkouts
  # `git diff HEAD^` is the whole PR, and `--argjson` hits ARG_MAX.
  CHANGED_JSON="${RUNNER_TEMP:-$(mktemp -d)}/deploy-changed.json"
  git diff --name-only HEAD^ HEAD | jq -Rsc 'split("\n") | map(select(length > 0))' > "$CHANGED_JSON"

  AFFECTED_CATALOG=$(jq -c --argjson pkgs "$AFFECTED_PKGS" --slurpfile changed "$CHANGED_JSON" '
    ($changed[0]) as $changed |
    [.[] | select(
      (.package != null and (.package as $p | $pkgs | index($p) != null))
      or
      ((.paths // []) as $paths | any($paths[]; . as $d | ($changed | any(.[]; startswith($d + "/")))))
    )]' <<<"$CATALOG")
fi

# Resolve each entry's arches and ECR arch (see the catalog comment),
# then fail loudly if the ECR arch is not among the arches built —
# the ECR push would otherwise silently never happen.
RESOLVED_CATALOG=$(jq -c '
  [.[]
    | (.arches // (if (.push | index("ghcr")) then ["arm64", "amd64"] else ["arm64"] end)) as $arches
    | (.ecr_arch // (if ($arches | length) == 1 then $arches[0] else "arm64" end)) as $ecr_arch
    | . + {arches: $arches, ecr_arch: $ecr_arch}
  ]' <<<"$AFFECTED_CATALOG")
BAD_ECR_ARCH=$(jq -c '[.[] | select((.push | index("ecr")) and ((.ecr_arch as $a | .arches | index($a)) | not)) | .service]' <<<"$RESOLVED_CATALOG")
if [[ "$(jq length <<<"$BAD_ECR_ARCH")" -gt 0 ]]; then
  echo "::error ::ecr_arch is not among the arches built for: $BAD_ECR_ARCH"
  exit 1
fi

# Build matrix: expand each entry to its arches. On PR events amd64 is
# skipped where arm64 covers the build (arch divergence in Rust/Node
# is rare; merge_group still validates amd64 before main), but never
# for a service whose only arch it is.
BUILD_MATRIX=$(jq -c --argjson skip_amd64 "$SKIP_AMD64" '
  [.[] as $e
    | $e.arches[]
    | $e + {arch: .}
    | select($skip_amd64 != true or .arch != "amd64" or ($e.arches | length) == 1)
    | del(.package, .paths, .arches)
  ] | { include: . }' <<<"$RESOLVED_CATALOG")

# Manifest matrix: services that publish multi-arch to GHCR.
MANIFEST_MATRIX=$(jq -c '
  map(select(.push | index("ghcr"))) | { service: [.[].service] }
' <<<"$AFFECTED_CATALOG")

echo "backend-images=$BUILD_MATRIX" | tee -a "$GITHUB_OUTPUT"
echo "backend-manifests=$MANIFEST_MATRIX" | tee -a "$GITHUB_OUTPUT"
