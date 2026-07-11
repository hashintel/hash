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
from pathlib import Path
from typing import Any

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


def provenance_block(
    *,
    producer: str,
    inputs: dict[str, str] | None = None,
    config: dict[str, Any] | None = None,
    seed: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Standard provenance block for JSON sidecars.

    ``inputs`` maps input names to content hashes. ``config`` is hashed to
    ``config_hash`` and embedded verbatim.
    """
    block: dict[str, Any] = {
        "producer": producer,
        "tool_version": atlas_tools.__version__,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if inputs is not None:
        block["input_hashes"] = dict(sorted(inputs.items()))
    if config is not None:
        block["config"] = config
        block["config_hash"] = sha256_bytes(canonical_json_bytes(config))
    if seed is not None:
        block["seed"] = seed
    if extra:
        block.update(extra)
    return block


def write_sidecar(path: Path | str, payload: dict[str, Any]) -> Path:
    """Write a JSON sidecar with stable key order and trailing newline."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def read_sidecar(path: Path | str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        loaded = json.load(f)
    if not isinstance(loaded, dict):
        raise ValueError(f"sidecar {path} is not a JSON object")
    return loaded
