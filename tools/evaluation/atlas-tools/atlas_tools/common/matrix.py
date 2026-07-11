"""Raw float matrix contract (PRD section 0.1).

Embeddings and coordinates are exchanged as raw row-major float32 files with
no header, plus a JSON sidecar ``<name>.meta.json`` (name appended to the
full binary filename, e.g. ``X.f32`` -> ``X.f32.meta.json``)::

    {"dtype": "f32", "dim": 3072, "rows": 986432, "byte_order": "little",
     "content_sha256": "...", "producer": "...", "created_at": "..."}

The sidecar is FLAT on disk — this exact shape is shared with the Rust
consumer, so :class:`MatrixDetails` fields are inlined at the top level next
to the :class:`~atlas_tools.common.provenance.Provenance` envelope fields
when writing, and split back out when loading. The binary carries no header.

The loader validates ``file size == rows * dim * 4`` and rejects mismatches
with an error naming the mismatch.
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
    make_provenance,
    read_sidecar,
    sha256_file,
    write_sidecar,
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


def _read_flat_sidecar(path: Path) -> MatrixProvenance:
    """Parse the flat on-disk sidecar back into the nested model."""
    data = read_sidecar(path)
    detail_fields = MatrixDetails.model_fields.keys()
    details = {key: data.pop(key) for key in list(detail_fields) if key in data}

    return MatrixProvenance.model_validate({**data, "details": details})


def _write_flat_sidecar(path: Path, provenance: MatrixProvenance) -> None:
    """Write the nested model as the flat sidecar shape pinned by PRD 0.1."""
    payload = provenance.model_dump(mode="json")
    details = payload.pop("details")
    # Envelope and detail field names are disjoint; None-valued envelope
    # fields are omitted to keep the sidecar minimal.
    flat = {key: value for key, value in payload.items() if value is not None}
    flat.update({key: value for key, value in details.items() if value is not None})

    write_sidecar(path, flat)


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

    meta = _read_flat_sidecar(meta_path_for(path)).details

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

    provenance = make_provenance(producer=producer, details=details)
    _write_flat_sidecar(meta_path_for(path), provenance)

    return provenance
