"""Write the FastAPI OpenAPI schema used by TypeScript code generation."""

from __future__ import annotations

import json
from pathlib import Path

from src.optimization_api import app


output_path = Path(__file__).resolve().parents[1] / "openapi" / "openapi.json"
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(
    json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
