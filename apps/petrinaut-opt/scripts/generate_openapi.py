"""Generate or check the FastAPI schema used by TypeScript code generation."""

import argparse
import json
import sys
from pathlib import Path

from petrinaut_optimization.api import app


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check the saved schema without rewriting it.",
    )
    arguments = parser.parse_args()
    output_path = Path(__file__).resolve().parents[1] / "openapi" / "openapi.json"
    schema = (json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n").encode("utf-8")

    if not arguments.check:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(schema)
        return 0

    try:
        saved_schema = output_path.read_bytes()
    except FileNotFoundError:
        problem = f"OpenAPI schema is missing: {output_path}"
    else:
        if saved_schema == schema:
            return 0
        problem = f"OpenAPI schema is out of date: {output_path}"

    sys.stderr.write(
        f"{problem}\nRun `uv run python -m scripts.generate_openapi` from apps/petrinaut-opt.\n"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
