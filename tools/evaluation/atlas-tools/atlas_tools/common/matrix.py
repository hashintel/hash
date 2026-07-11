"""Raw float matrix contract (PRD section 0.1).

Embeddings and coordinates are exchanged as raw row-major float32 files with
no header, plus a JSON sidecar ``<name>.meta.json``::

    {"dtype": "f32", "dim": 3072, "rows": 986432, "byte_order": "little",
     "content_sha256": "...", "producer": "...", "created_at": "..."}

The loader validates ``file size == rows * dim * 4`` and rejects mismatches
with an error naming the mismatch. The binary carries no header; this matches
the Rust consumer's contract.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from atlas_tools.common.provenance import (
    provenance_block,
    read_sidecar,
    sha256_file,
    write_sidecar,
)

_F32_BYTES = 4


def meta_path_for(path: Path | str) -> Path:
    """Sidecar path for a raw matrix file: ``<name>.meta.json``."""
    path = Path(path)
    return path.with_name(path.name + ".meta.json")


@dataclass(frozen=True)
class MatrixMeta:
    dtype: str
    dim: int
    rows: int
    byte_order: str
    content_sha256: str
    producer: str
    created_at: str
    raw: dict[str, Any]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MatrixMeta":
        missing = [
            key
            for key in ("dtype", "dim", "rows", "byte_order", "content_sha256")
            if key not in data
        ]
        if missing:
            raise ValueError(f"matrix sidecar missing required fields: {missing}")
        return cls(
            dtype=data["dtype"],
            dim=int(data["dim"]),
            rows=int(data["rows"]),
            byte_order=data["byte_order"],
            content_sha256=data["content_sha256"],
            producer=data.get("producer", ""),
            created_at=data.get("created_at", ""),
            raw=data,
        )


def load_matrix(
    path: Path | str,
    *,
    mmap: bool = True,
    verify_hash: bool = False,
) -> tuple[np.ndarray, MatrixMeta]:
    """Load a raw f32 matrix and validate it against its sidecar.

    Raises ``ValueError`` naming the mismatch when the file size does not
    equal ``rows * dim * 4`` or the sidecar declares an unsupported layout.
    """
    path = Path(path)
    meta = MatrixMeta.from_dict(read_sidecar(meta_path_for(path)))

    if meta.dtype != "f32":
        raise ValueError(
            f"{path}: sidecar dtype is {meta.dtype!r}; only 'f32' is supported"
        )
    if meta.byte_order != "little":
        raise ValueError(
            f"{path}: sidecar byte_order is {meta.byte_order!r};"
            " only 'little' is supported"
        )
    if meta.rows < 0 or meta.dim <= 0:
        raise ValueError(f"{path}: invalid shape rows={meta.rows} dim={meta.dim}")

    expected = meta.rows * meta.dim * _F32_BYTES
    actual = path.stat().st_size
    if actual != expected:
        raise ValueError(
            f"{path}: file size mismatch: sidecar declares rows={meta.rows}"
            f" dim={meta.dim} => {expected} bytes, file is {actual} bytes"
        )

    if verify_hash:
        digest = sha256_file(path)
        if digest != meta.content_sha256:
            raise ValueError(
                f"{path}: content hash mismatch: sidecar declares"
                f" {meta.content_sha256}, file hashes to {digest}"
            )

    if mmap:
        data = np.memmap(path, dtype="<f4", mode="r", shape=(meta.rows, meta.dim))
        array = np.asarray(data)
    else:
        array = np.fromfile(path, dtype="<f4").reshape(meta.rows, meta.dim)
    return array, meta


def write_matrix(
    path: Path | str,
    array: np.ndarray,
    *,
    producer: str,
    extra_meta: dict[str, Any] | None = None,
) -> MatrixMeta:
    """Write a raw row-major little-endian f32 matrix plus its sidecar."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    array = np.ascontiguousarray(array, dtype="<f4")
    if array.ndim != 2:
        raise ValueError(f"expected a 2-d array, got shape {array.shape}")
    if sys.byteorder != "little":
        # `<f4` above already forces little-endian bytes; this is a guard for
        # exotic platforms where tobytes() semantics could surprise us.
        array = array.astype("<f4")

    array.tofile(path)

    meta_dict: dict[str, Any] = {
        "dtype": "f32",
        "dim": int(array.shape[1]),
        "rows": int(array.shape[0]),
        "byte_order": "little",
        "content_sha256": sha256_file(path),
        **provenance_block(producer=producer),
    }
    if extra_meta:
        meta_dict.update(extra_meta)
    write_sidecar(meta_path_for(path), meta_dict)
    return MatrixMeta.from_dict(meta_dict)
