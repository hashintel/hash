"""Load exact configuration bytes through an explicit YAML-to-JSON boundary.

YAML supplies ergonomic duration strings and sequences, while domain models
remain strict for Python callers. The loader first proves that the decoded
document is JSON data and then asks Pydantic to apply strict JSON semantics;
this permits JSON arrays and ISO durations without enabling general coercion.
"""

from dataclasses import dataclass
from pathlib import Path

import trio
import yaml
from pydantic import JsonValue, TypeAdapter

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.domain.api import (
    RUN_CONFIG_ADAPTER,
    GridRunConfig,
    RunConfig,
)

_JSON_ADAPTER = TypeAdapter(JsonValue)


@dataclass(frozen=True, slots=True, kw_only=True)
class LoadedConfig:
    """Bind validated semantics to the exact source bytes that supplied them."""

    path: Path
    config: RunConfig
    content_hash: Sha256Hex

    def grid(self) -> GridRunConfig:
        """Narrow to grid configuration or fail at the composition boundary."""
        if not isinstance(self.config, GridRunConfig):
            raise TypeError("loaded run config is not a grid config")

        return self.config


def load_config(path: Path) -> LoadedConfig:
    """Read and validate one configuration while retaining its exact hash."""
    try:
        source = path.read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read evaluation config {path}: {error}") from error

    try:
        decoded = yaml.safe_load(source)
        json_value = _JSON_ADAPTER.validate_python(decoded)
        config = RUN_CONFIG_ADAPTER.validate_json(
            canonical_json_bytes(json_value),
            strict=True,
        )
    except (TypeError, ValueError) as error:
        raise ValueError(f"invalid evaluation config {path}: {error}") from error

    return LoadedConfig(path=path, config=config, content_hash=sha256_bytes(source))


async def load_config_async(path: Path) -> LoadedConfig:
    """Load configuration without blocking Trio's event loop on filesystem I/O."""
    return await trio.to_thread.run_sync(load_config, path, abandon_on_cancel=False)
