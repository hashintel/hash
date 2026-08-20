#!/usr/bin/env sh
# Generates src/petrinaut/models.py from the CLI's protocol schema document.
# The output is checked in; `codegen` regenerates it and CI fails on drift.
set -eu
cd "$(dirname "$0")/.."

uv run datamodel-codegen \
  --input ../../@hashintel/petrinaut-cli/schemas/optimization-protocol.schema.json \
  --input-file-type jsonschema \
  --output src/petrinaut/models.py \
  --output-model-type pydantic_v2.BaseModel \
  --target-python-version 3.10 \
  --disable-timestamp \
  --use-union-operator \
  --use-double-quotes \
  --field-constraints \
  --collapse-root-models \
  --formatters ruff-check ruff-format

# The generator always emits a class for the document root, which is only a
# `$defs` container here. Drop it, then re-lint so unused imports go with it.
uv run python - <<'CLEANUP'
import pathlib, re

path = pathlib.Path("src/petrinaut/models.py")
text = path.read_text()
text, count = re.subn(
    r"class Model\(RootModel\[Any\]\):\n(?:    .*\n)+\n\n",
    "",
    text,
)
if count != 1:
    raise SystemExit(f"expected one document-root model, found {count}")
path.write_text(text)
CLEANUP
uv run ruff check --fix src/petrinaut/models.py
uv run ruff format src/petrinaut/models.py
