"""Raw float matrix contract.

Embeddings and coordinates are exchanged as raw row-major little-endian float32 files with
no header, plus a JSON sidecar ``<name>.meta.json`` (the suffix is appended to the full
binary filename, so ``X.f32`` gets ``X.f32.meta.json``). The sidecar is a
:class:`Provenance` envelope whose ``details`` carry the matrix shape contract::

    {"producer": "...", "created_at": "...",
     "details": {"dtype": "f32", "dim": 3072, "rows": 986432,
                 "byte_order": "little", "content_sha256": "..."}}

The binary itself carries no header, so the sidecar is authoritative: the loader rejects
any file whose size disagrees with ``rows * dim * 4`` and names the mismatch in the error.
"""

from os import PathLike
from pathlib import Path
from typing import Annotated, Final, Literal

import numpy as np
from pydantic import BaseModel, Field, NonNegativeInt

from atlas_tools.common.data import Dim, JsonDict, Sha256Hex
from atlas_tools.common.provenance import (
    Provenance,
    sha256_file,
)

_F32_BYTES: Final = 4
_MATRIX_NDIM: Final = 2


def meta_path_for(path: PathLike) -> Path:
    """Sidecar path for a raw matrix file: ``<name>.meta.json``.

    The suffix is appended to the full filename (``X.f32`` gets ``X.f32.meta.json``), so
    the sidecar never collides with sidecars of other artifacts sharing a stem.
    """
    path = Path(path)

    return path.with_name(path.name + ".meta.json")


class MatrixDetails(BaseModel):
    dtype: Literal["f32"]

    dim: Annotated[Dim, Field(gt=0)]
    rows: NonNegativeInt

    byte_order: Literal["little"]
    content_sha256: Sha256Hex

    extra: JsonDict | None = None


MatrixProvenance = Provenance[MatrixDetails]


def load_matrix(
    path: PathLike,
    *,
    mmap: bool = True,
    verify_hash: bool = False,
) -> tuple[np.ndarray, MatrixDetails]:
    """Load a raw f32 matrix and validate it against its sidecar.

    Raises ``ValueError`` naming the mismatch when the file size does not equal
    ``rows * dim * 4``, when the sidecar declares an unsupported dtype or byte order, or,
    with ``verify_hash=True``, when the file content does not hash to the sidecar's
    ``content_sha256``.
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
    """Write a raw row-major little-endian f32 matrix plus its sidecar.

    Raises ``ValueError`` when the input is not a 2-d array.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    array = np.ascontiguousarray(array, dtype="<f4")
    if array.ndim != _MATRIX_NDIM:
        raise ValueError(f"expected a 2-d array, got shape {array.shape}")

    array.tofile(path)

    details = MatrixDetails(
        dtype="f32",
        dim=Dim(array.shape[1]),
        rows=int(array.shape[0]),
        byte_order="little",
        content_sha256=sha256_file(path),
        extra=extra_metadata,
    )

    provenance = MatrixProvenance.make(producer=producer, details=details)
    provenance.write(meta_path_for(path))

    return provenance
