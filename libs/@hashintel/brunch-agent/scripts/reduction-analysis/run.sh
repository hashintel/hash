#!/usr/bin/env bash
# Dead-code analysis of the Brunch packages and their two consuming apps
# (apps/brunch-agent, apps/petrinaut-website) with knip and fallow, run ad hoc
# through npx. Only Brunch-scoped paths are reported: knip analyzes the Brunch
# workspaces and their consumers, and fallow builds the whole-repository graph
# but its findings are filtered to the same paths.
#
# Knip resolves workspace imports through the `import` condition and maps dist
# back to src only through a tsconfig outDir, which these packages lack, so the
# packages' untracked dist folders are removed first and rebuilt from the turbo
# cache afterwards (SKIP_REBUILD=1 to skip). Set OUT_DIR to keep the JSON.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git rev-parse --show-toplevel)"
out="${OUT_DIR:-$(mktemp -d)}"
mkdir -p "$out"
cd "$root"

rm -rf libs/@hashintel/brunch-agent/packages/*/dist

fallow=(npx -y fallow@3 dead-code -c "$here/fallow.json" --include-entry-exports --format json --quiet)
"${fallow[@]}" > "$out/fallow-dead.json" 2> /dev/null || true
"${fallow[@]}" --production > "$out/fallow-prod.json" 2> /dev/null || true

knip=(npx -y knip@6 -c "$here/knip.json" --include-entry-exports --reporter json --no-progress
  --workspace '@hashintel/brunch-agent*' --workspace @apps/brunch-agent --workspace @apps/petrinaut-website)
# Node resolves workspace imports inside the Vite configs knip loads; point it at src too.
NODE_OPTIONS="--conditions=@dev/source" "${knip[@]}" > "$out/knip-dead.json" 2> "$out/knip-dead.err" || true
NODE_OPTIONS="--conditions=@dev/source" "${knip[@]}" --production > "$out/knip-prod.json" 2> "$out/knip-prod.err" || true

node --experimental-strip-types "$here/summarize.mts" "$out"
echo "Reports: $out"

if [[ "${SKIP_REBUILD:-0}" != 1 ]]; then
  turbo run build --filter='./libs/@hashintel/brunch-agent/packages/*' --output-logs=errors-only > /dev/null
fi
