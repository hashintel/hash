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

SPEC="$DIR/../../../../../apps/hash-graph/openapi/openapi.json"

# cd up to the package directory (needed for poetry and yarn)
cd "$DIR/.."

# Take the specification and bundle all models into a single file
yarn run swagger-cli bundle "$SPEC" --outfile "$DIR/openapi.bundle.json"

# swagger-cli escapes the $ with %24, which breaks the codegen
sed -i -e 's/%24/$/g' "$DIR/openapi.bundle.json"

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
  --strict-nullable
