"""Generate or check the FastAPI schema used by TypeScript code generation."""

import argparse
import json
import sys
from enum import IntEnum
from pathlib import Path

from petrinaut_optimization.api import app

OPENAPI_FILE = Path(__file__).resolve().parents[1] / "openapi" / "openapi.json"


class ExitCode(IntEnum):
    SUCCESS = 0
    FAILURE = 1


def main() -> ExitCode:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check the saved schema without rewriting it.",
    )
    arguments = parser.parse_args()
    schema = (json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n").encode("utf-8")

    if not arguments.check:
        OPENAPI_FILE.parent.mkdir(parents=True, exist_ok=True)
        OPENAPI_FILE.write_bytes(schema)
        return ExitCode.SUCCESS

    try:
        saved_schema = OPENAPI_FILE.read_bytes()
    except FileNotFoundError:
        problem = f"OpenAPI schema is missing: {OPENAPI_FILE}"
    else:
        if saved_schema == schema:
            return ExitCode.SUCCESS
        problem = f"OpenAPI schema is out of date: {OPENAPI_FILE}"

    sys.stderr.write(
        f"{problem}\nRun `uv run python -m scripts.generate_openapi` from apps/petrinaut-opt.\n"
    )
    return ExitCode.FAILURE


if __name__ == "__main__":
    sys.exit(main())
