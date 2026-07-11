"""Provenance sidecars: every artifact records inputs, config, seed, versions.

:class:`Provenance` is a typed, self-validating envelope for artifact
sidecars. ``TDetails`` carries the artifact-specific fields; ``TConfig`` the
producing tool's configuration (a typed model where one exists, or
``JsonDict`` for free-form engine configs). Unparametrized, ``TConfig``
defaults to ``None``: such sidecars must not carry a config. Loading
re-validates ``config_hash`` against ``config``, so tampering is detected.

Free-form JSON documents that are not provenance envelopes (reports,
manifests) are written with :func:`write_sidecar`/:func:`read_sidecar`; their
provenance lives in a separate ``*.meta.json`` envelope next to them.

Determinism rules:
- ``created_at`` is the only wall-clock field and is excluded from all
  content hashes.
- Hash inputs use canonical JSON (sorted keys, compact separators, UTF-8);
  typed configs are hashed over their JSON-mode dump, so hashes agree between
  the in-memory model and the reloaded sidecar.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import datetime, timezone
from os import PathLike
from pathlib import Path
from typing import Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    JsonValue,
    model_validator,
)
from pydantic_extra_types.semantic_version import SemanticVersion

import atlas_tools

type JsonDict = dict[str, JsonValue]


def canonical_json_bytes(obj: object) -> bytes:
    """Serialize ``obj`` to canonical JSON bytes (sorted keys, compact).

    Pydantic models are dumped in JSON mode first, so a typed config hashes
    identically before writing and after reloading. Non-JSON-serializable
    input raises ``TypeError`` (from ``json.dumps``).
    """
    if isinstance(obj, BaseModel):
        obj = obj.model_dump(mode="json")

    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: PathLike, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()

    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break

            digest.update(chunk)

    return digest.hexdigest()


class Provenance[TDetails, TConfig = None](BaseModel):
    producer: str
    created_at: AwareDatetime
    # None for sidecars written by foreign producers (e.g. the Rust pipeline)
    # that do not version themselves with this tool.
    tool_version: SemanticVersion | None = None

    config: TConfig | None = None
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

    @classmethod
    def make(
        cls,
        *,
        producer: str,
        input_hashes: dict[str, str] | None = None,
        config: TConfig | None = None,
        seed: int | None = None,
        details: TDetails,
    ) -> Self:
        """Build an envelope with this tool's version and the current time.

        Call on a parametrized alias (``MatrixProvenance.make(...)``) so
        ``TConfig``/``TDetails`` bind; unparametrized, ``TConfig`` defaults
        to ``None`` and any config is rejected.
        """
        return cls(
            producer=producer,
            tool_version=SemanticVersion.parse(atlas_tools.__version__),
            created_at=datetime.now(timezone.utc),
            input_hashes=(
                dict(sorted(input_hashes.items())) if input_hashes is not None else None
            ),
            config=config,
            config_hash=(
                sha256_bytes(canonical_json_bytes(config))
                if config is not None
                else None
            ),
            seed=seed,
            details=details,
        )


def write_sidecar(path: PathLike, payload: Mapping[str, object]) -> Path:
    """Write a JSON sidecar with stable key order and trailing newline."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def read_sidecar(path: PathLike) -> JsonDict:
    with open(path, encoding="utf-8") as f:
        loaded = json.load(f)
    if not isinstance(loaded, dict):
        raise ValueError(f"sidecar {path} is not a JSON object")
    return loaded
