#!/usr/bin/env bash
set -euo pipefail

# Thanks to: https://stackoverflow.com/a/246128/9077988
SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )

SPEC_DIR="$DIR/../../../../../apps/hash-graph/openapi"
SPEC="$SPEC_DIR/openapi.json"

# cd up to the package directory (needed for poetry and yarn)
cd "$DIR/.."

poetry run datamodel-codegen --version

# Take the specification and bundle all models into a single file
yarn run redocly bundle --format=json "$SPEC" -o "$DIR/openapi.bundle.json"

# we need to do a bit of plumbing, this includes:
# merging `PropertyObjectReference` from `models/shared.json` into components.schemas, renaming all `#/definitions/` to `#/components/schemas/` (redocly ignores `x-patternProperties` and `patternProeprties`)
# renaming `x-patternProperties` to `patternProperties`.
SHARED_MODELS="$SPEC_DIR/models/shared.json"
jq -s '
  .[0].components.schemas.PropertyObjectReference = .[1].definitions.PropertyObjectReference
  | .[0]
  | walk( if type == "string" then sub("^#/definitions/"; "#/components/schemas/") else . end )
  | walk( if type == "object" and has("x-patternProperties") then .patternProperties = .["x-patternProperties"] | del(.["x-patternProperties"]) else . end )
  ' "$DIR/openapi.bundle.json" "$SHARED_MODELS" > "$DIR/openapi.bundle.json.tmp"
mv "$DIR/openapi.bundle.json.tmp" "$DIR/openapi.bundle.json"

poetry run datamodel-codegen \
  --input "$DIR/openapi.bundle.json" \
  --output graph_client/models.py \
  --output-model-type pydantic_v2.BaseModel \
  --input-file-type openapi \
  --use-standard-collections \
  --use-union-operator \
  --target-python-version 3.11 \
  --use-schema-description \
  --snake-case-field \
  --disable-timestamp \
  --enable-version-header \
  --enum-field-as-literal one \
  --use-double-quotes \
  --field-constraints \
  --allow-population-by-field-name \
  --strict-nullable \
  --use-title-as-name \
  --aliases "$DIR/aliases.json"

poetry run python "$DIR/rebase.py"
