"""Raw float matrix contract (PRD section 0.1).

Embeddings and coordinates are exchanged as raw row-major little-endian
float32 files with no header, plus a JSON sidecar ``<name>.meta.json``
(name appended to the full binary filename, e.g. ``X.f32`` ->
``X.f32.meta.json``). The sidecar is a :class:`Provenance` envelope whose
``details`` carry the matrix shape contract::

    {"producer": "...", "created_at": "...",
     "details": {"dtype": "f32", "dim": 3072, "rows": 986432,
                 "byte_order": "little", "content_sha256": "..."}}

The loader validates ``file size == rows * dim * 4`` and rejects mismatches
with an error naming the mismatch. The binary itself carries no header.
"""

from __future__ import annotations

from os import PathLike
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, NonNegativeInt, PositiveInt

from atlas_tools.common.provenance import (
    JsonDict,
    Provenance,
    sha256_file,
)

_F32_BYTES = 4


def meta_path_for(path: PathLike) -> Path:
    """Sidecar path for a raw matrix file: ``<name>.meta.json``.

    Appends to the full filename (``X.f32`` -> ``X.f32.meta.json``) so the
    sidecar never collides with sidecars of other artifacts sharing a stem.
    """
    path = Path(path)

    return path.with_name(path.name + ".meta.json")


class MatrixDetails(BaseModel):
    dtype: Literal["f32"]

    dim: PositiveInt
    rows: NonNegativeInt

    byte_order: Literal["little"]
    content_sha256: str

    extra: JsonDict | None = None


MatrixProvenance = Provenance[MatrixDetails]


def load_matrix(
    path: PathLike,
    *,
    mmap: bool = True,
    verify_hash: bool = False,
) -> tuple[np.ndarray, MatrixDetails]:
    """Load a raw f32 matrix and validate it against its sidecar.

    Raises ``ValueError`` naming the mismatch when the file size does not
    equal ``rows * dim * 4`` or the sidecar declares an unsupported layout.
    """
    path = Path(path)

    meta = MatrixProvenance.load(meta_path_for(path)).details

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
    path: PathLike,
    array: np.ndarray,
    *,
    producer: str,
    extra_metadata: JsonDict | None = None,
) -> MatrixProvenance:
    """Write a raw row-major little-endian f32 matrix plus its sidecar."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    array = np.ascontiguousarray(array, dtype="<f4")
    if array.ndim != 2:
        raise ValueError(f"expected a 2-d array, got shape {array.shape}")

    array.tofile(path)

    details = MatrixDetails(
        dtype="f32",
        dim=int(array.shape[1]),
        rows=int(array.shape[0]),
        byte_order="little",
        content_sha256=sha256_file(path),
        extra=extra_metadata,
    )

    provenance = MatrixProvenance.make(producer=producer, details=details)
    provenance.write(meta_path_for(path))

    return provenance
