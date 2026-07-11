"""Provenance sidecars: every artifact records inputs, config, seed, versions.

Determinism rules:
- ``created_at`` is the only wall-clock field and is excluded from all
  content hashes.
- Hash inputs use canonical JSON (sorted keys, compact separators, UTF-8).
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from os import PathLike
from pathlib import Path
from typing import Any, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    model_validator,
)
from pydantic.config import JsonDict
from pydantic_extra_types.semantic_version import SemanticVersion

import atlas_tools


def canonical_json_bytes(obj: Any) -> bytes:
    """Serialize ``obj`` to canonical JSON bytes (sorted keys, compact)."""
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path | str, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break

            digest.update(chunk)

    return digest.hexdigest()


class Provenance[TDetails](BaseModel):
    producer: str
    tool_version: SemanticVersion
    created_at: AwareDatetime

    config: JsonDict | None
    config_hash: str | None

    input_hashes: dict[str, str] | None

    seed: int | None

    details: TDetails

    @model_validator(mode="after")
    def check_config_hash_consistency(self) -> Self:
        config_none = self.config is None
        config_hash_none = self.config_hash is None

        if config_none == config_hash_none:
            raise ValueError("The hash must be set only if the config is set")

        if self.config_hash:
            # validate the hash against the config
            config_hash = sha256_bytes(canonical_json_bytes(self.config))

            if config_hash != self.config_hash:
                raise ValueError(
                    "Hash mismatch: computed hash does not match the stored hash"
                )

        return self

    def write(self, path: PathLike) -> Path:
        """Write a JSON sidecar with stable key order and trailing newline."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        path.write_text(
            json.dumps(
                self.model_dump(mode="json"),
                sort_keys=True,
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )

        return path

    @classmethod
    def load(cls, path: PathLike) -> Self:
        """Load a sidecar from a JSON file."""
        return cls.model_validate_json(Path(path).read_text())


def make_provenance[TDetails](
    *,
    producer: str,
    input_hashes: dict[str, str] | None = None,
    config: dict[str, Any] | None = None,
    seed: int | None = None,
    details: TDetails,
) -> Provenance[TDetails]:
    """Standard provenance block for JSON sidecars.

    ``inputs`` maps input names to content hashes. ``config`` is hashed to
    ``config_hash`` and embedded verbatim.
    """

    return Provenance(
        producer=producer,
        tool_version=atlas_tools.__version__,
        created_at=datetime.now(timezone.utc),
        input_hashes=(
            dict(sorted(input_hashes.items())) if input_hashes is not None else None
        ),
        config=(config if config is not None else None),
        config_hash=(
            sha256_bytes(canonical_json_bytes(config)) if config is not None else None
        ),
        seed=seed,
        details=details,
    )
