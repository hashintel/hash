"""Write the FastAPI OpenAPI schema used by TypeScript code generation."""

import json
from pathlib import Path

from src.optimization_api import app

DOCUMENT_PATH = Path(__file__).resolve().parents[1] / "openapi" / "openapi.json"
"""Committed location of the document the TypeScript client is generated from."""

CODEGEN_COMMAND = "yarn workspace @python/petrinaut-optimization codegen"
"""How to bring the committed document back in step with the service."""


def render_document() -> str:
    """Serialize the service's OpenAPI schema in its committed form.

    Keys are sorted and the text ends in a newline, so regenerating an
    unchanged schema rewrites the same bytes. The test suite renders through
    this function too, which is what keeps the check and the generator from
    disagreeing about formatting.
    """
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


def main() -> None:
    DOCUMENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOCUMENT_PATH.write_text(render_document(), encoding="utf-8")


if __name__ == "__main__":
    main()
