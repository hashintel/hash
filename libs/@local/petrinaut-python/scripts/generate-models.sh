#!/usr/bin/env sh
# Generates src/petrinaut/models.py from the CLI's protocol schema document.
set -eu
cd "$(dirname "$0")/.."

python_version=$(uv run --frozen python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')

uv run --frozen datamodel-codegen \
  --input ../../@hashintel/petrinaut-cli/schemas/optimization-protocol.schema.json \
  --input-file-type jsonschema \
  --output src/petrinaut/models.py \
  --output-model-type pydantic_v2.BaseModel \
  --target-python-version "$python_version" \
  --preset practical-py314-20260909 \
  --skip-root-model \
  --custom-file-header '"""Pydantic models generated from the Petrinaut optimization protocol schema."""' \
  --formatters ruff-check ruff-format
