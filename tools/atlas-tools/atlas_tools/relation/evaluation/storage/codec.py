"""Validate canonical JSON artifacts at the filesystem boundary.

Loaders reject coercion through strict Pydantic validation and report the
precise file or JSONL line that failed. Async variants move the complete read
and validation pass off Trio's event loop.
"""

from functools import partial
from pathlib import Path

import trio
from pydantic import BaseModel, ValidationError


def load_json[ModelT: BaseModel](path: Path, model: type[ModelT]) -> ModelT:
    """Load one strict model from a JSON file.

    Raises:
        ValueError: The file cannot be read or does not satisfy `model`.

    """
    try:
        payload = path.read_bytes()
        return model.model_validate_json(payload, strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid {path}: {error}") from error


def load_jsonl[RowT: BaseModel](path: Path, model: type[RowT]) -> tuple[RowT, ...]:
    """Load strict JSONL rows in file order while ignoring blank lines.

    Raises:
        ValueError: The file cannot be read or a row does not satisfy `model`.

    """
    rows: list[RowT] = []
    try:
        input_file = path.open("rb")
    except OSError as error:
        raise ValueError(f"cannot read {path}: {error}") from error

    with input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue

            try:
                rows.append(model.model_validate_json(line, strict=True))
            except ValidationError as error:
                raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error

    return tuple(rows)


async def load_json_async[ModelT: BaseModel](
    path: Path,
    model: type[ModelT],
) -> ModelT:
    """Load one JSON model without blocking Trio's event loop."""
    loader = partial(load_json, path, model)
    return await trio.to_thread.run_sync(loader, abandon_on_cancel=False)


async def load_jsonl_async[RowT: BaseModel](
    path: Path,
    model: type[RowT],
) -> tuple[RowT, ...]:
    """Load JSONL rows without blocking Trio's event loop."""
    loader = partial(load_jsonl, path, model)
    return await trio.to_thread.run_sync(loader, abandon_on_cancel=False)
