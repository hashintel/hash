"""Provenance sidecars: every artifact records inputs, config, seed, versions.

Two layers:

- :class:`Provenance` — a typed, self-validating model for artifact sidecars
  (raw matrices, layouts). ``TDetails`` carries the artifact-specific fields;
  the envelope carries producer/version/config/seed. Loading re-validates
  ``config_hash`` against ``config``, so tampering is detected.
- :func:`provenance_block` + :func:`write_sidecar`/:func:`read_sidecar` —
  plain-dict helpers for free-form payloads (reports, manifests, truth files)
  that embed provenance fields among other keys via ``**provenance_block()``.

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
    JsonValue,
    model_validator,
)
from pydantic_extra_types.semantic_version import SemanticVersion

type JsonDict = dict[str, JsonValue]

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
    created_at: AwareDatetime
    # None for sidecars written by foreign producers (e.g. the Rust pipeline)
    # that do not version themselves with this tool.
    tool_version: SemanticVersion | None = None

    config: JsonDict | None = None
    config_hash: str | None = None

    input_hashes: dict[str, str] | None = None

    seed: int | None = None

    details: TDetails

    @model_validator(mode="after")
    def check_config_hash_consistency(self) -> Self:
        config_none = self.config is None
        config_hash_none = self.config_hash is None

        if config_none != config_hash_none:
            raise ValueError("config_hash must be set if and only if config is set")

        if self.config_hash is not None:
            # validate the hash against the config
            config_hash = sha256_bytes(canonical_json_bytes(self.config))

            if config_hash != self.config_hash:
                raise ValueError(
                    "config_hash mismatch: computed hash does not match the stored hash"
                )

        return self

    def write(self, path: PathLike) -> Path:
        """Write a JSON sidecar with stable key order and trailing newline."""
        return write_sidecar(path, self.model_dump(mode="json"))

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
    """Build a typed provenance envelope around artifact-specific ``details``.

    ``input_hashes`` maps input names to content hashes. ``config`` is hashed
    to ``config_hash`` and embedded verbatim.
    """

    return Provenance(
        producer=producer,
        tool_version=atlas_tools.__version__,
        created_at=datetime.now(timezone.utc),
        input_hashes=(
            dict(sorted(input_hashes.items())) if input_hashes is not None else None
        ),
        config=config,
        config_hash=(
            sha256_bytes(canonical_json_bytes(config)) if config is not None else None
        ),
        seed=seed,
        details=details,
    )


def provenance_block(
    *,
    producer: str,
    input_hashes: dict[str, str] | None = None,
    config: dict[str, Any] | None = None,
    seed: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Plain-dict provenance for free-form payloads.

    Use this when provenance fields are merged into a larger document
    (``{**payload, **provenance_block(...)}``). For standalone artifact
    sidecars prefer :func:`make_provenance` with a typed details model.
    """
    block: dict[str, Any] = {
        "producer": producer,
        "tool_version": atlas_tools.__version__,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if input_hashes is not None:
        block["input_hashes"] = dict(sorted(input_hashes.items()))
    if config is not None:
        block["config"] = config
        block["config_hash"] = sha256_bytes(canonical_json_bytes(config))
    if seed is not None:
        block["seed"] = seed
    if extra:
        block.update(extra)
    return block


def write_sidecar(path: PathLike, payload: dict[str, Any]) -> Path:
    """Write a JSON sidecar with stable key order and trailing newline."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def read_sidecar(path: PathLike) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        loaded = json.load(f)
    if not isinstance(loaded, dict):
        raise ValueError(f"sidecar {path} is not a JSON object")
    return loaded
