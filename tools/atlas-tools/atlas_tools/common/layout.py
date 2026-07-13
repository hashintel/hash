"""Layout artifact contract.

A layout is a ``layout.npz`` holding ``xy``, an ``(n, 2)`` float32 coordinate array, and
``row_id``, an ``(n,)`` int64 array, plus a sidecar ``layout.meta.json`` recording engine,
config hash, seed, and source-embedding hash. The pair is the complete interface between
layout engines and their consumers: reading a layout never requires engine code.

A missing sidecar is a hard error by default, because a layout without provenance cannot be
reproduced from its recorded inputs. Pass ``require_provenance=False`` for ad-hoc inspection
of bare ``.npz`` files.
"""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Final

import numpy as np
from pydantic import BaseModel, NonNegativeInt

from atlas_tools.common.data import JsonDict, Sha256Hex
from atlas_tools.common.provenance import (
    Provenance,
    sha256_file,
)

_XY_NDIM: Final = 2
_XY_COLUMNS: Final = 2


def layout_meta_path_for(path: PathLike) -> Path:
    """Sidecar path for a layout file: ``layout.npz`` maps to ``layout.meta.json``."""
    path = Path(path)
    stem = path.name.removesuffix(".npz")
    return path.with_name(stem + ".meta.json")


class LayoutDetails(BaseModel):
    engine: str
    rows: NonNegativeInt

    layout_sha256: Sha256Hex
    source_embedding_hash: Sha256Hex | None = None

    extra: JsonDict | None = None


# Engine configs are free-form JSON by design: they are hashed and reproduced verbatim,
# never interpreted, so no engine-specific schema exists to type them against.
LayoutProvenance = Provenance[LayoutDetails, JsonDict]


@dataclass(frozen=True)
class LayoutArtifact:
    xy: np.ndarray
    row_id: np.ndarray

    provenance: LayoutProvenance | None


def load_layout(path: PathLike, *, require_provenance: bool = True) -> LayoutArtifact:
    """Load and validate a ``layout.npz`` artifact plus its sidecar.

    Raises ``ValueError`` when the archive is missing the ``xy`` or ``row_id`` arrays,
    when ``xy`` is not ``(n, 2)`` float32, when ``row_id`` is not ``(n,)`` int64, when the
    row counts disagree, when ``xy`` contains non-finite values, or when the sidecar is
    absent while ``require_provenance`` is true.
    """
    path = Path(path)

    with np.load(path) as npz:
        if "xy" not in npz or "row_id" not in npz:
            raise ValueError(
                f"{path}: layout.npz must contain 'xy' and 'row_id' arrays,"
                f" found {sorted(npz.files)}"
            )

        xy = np.asarray(npz["xy"])
        row_id = np.asarray(npz["row_id"])

    if xy.ndim != _XY_NDIM or xy.shape[1] != _XY_COLUMNS:
        raise ValueError(f"{path}: 'xy' must have shape (n, 2), got {xy.shape}")

    if xy.dtype != np.float32:
        raise ValueError(f"{path}: 'xy' must be float32, got {xy.dtype}")

    if row_id.ndim != 1:
        raise ValueError(f"{path}: 'row_id' must have shape (n,), got {row_id.shape}")

    if row_id.dtype != np.int64:
        raise ValueError(f"{path}: 'row_id' must be int64, got {row_id.dtype}")

    if row_id.shape[0] != xy.shape[0]:
        raise ValueError(
            f"{path}: row count mismatch: xy has {xy.shape[0]} rows, row_id has {row_id.shape[0]}"
        )

    if not np.isfinite(xy).all():
        raise ValueError(f"{path}: 'xy' contains non-finite values")

    meta_path = layout_meta_path_for(path)

    if not meta_path.exists():
        if require_provenance:
            raise ValueError(
                f"{path}: missing sidecar {meta_path.name}; a layout artifact"
                " requires provenance (pass require_provenance=False for"
                " ad-hoc inspection)"
            )
        return LayoutArtifact(xy=xy, row_id=row_id, provenance=None)

    return LayoutArtifact(xy=xy, row_id=row_id, provenance=LayoutProvenance.load(meta_path))


def write_layout(
    path: PathLike,
    xy: np.ndarray,
    row_id: np.ndarray | None = None,
    *,
    engine: str,
    config: JsonDict | None = None,
    seed: int | None = None,
    source_embedding_hash: Sha256Hex | None = None,
    extra_meta: JsonDict | None = None,
) -> LayoutArtifact:
    """Write ``layout.npz`` plus its ``layout.meta.json`` sidecar.

    When ``row_id`` is omitted it defaults to ``0..n-1``. Raises ``ValueError`` when
    ``xy`` is not ``(n, 2)`` or when ``row_id`` does not have shape ``(n,)``.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    xy = np.ascontiguousarray(xy, dtype=np.float32)
    if xy.ndim != _XY_NDIM or xy.shape[1] != _XY_COLUMNS:
        raise ValueError(f"'xy' must have shape (n, 2), got {xy.shape}")

    if row_id is None:
        row_id = np.arange(xy.shape[0], dtype=np.int64)

    row_id = np.ascontiguousarray(row_id, dtype=np.int64)
    if row_id.shape != (xy.shape[0],):
        raise ValueError(f"'row_id' must have shape ({xy.shape[0]},), got {row_id.shape}")

    np.savez(path, xy=xy, row_id=row_id)

    provenance = LayoutProvenance.make(
        producer=engine,
        config=config,
        seed=seed,
        details=LayoutDetails(
            engine=engine,
            rows=int(xy.shape[0]),
            layout_sha256=sha256_file(path),
            source_embedding_hash=source_embedding_hash,
            extra=extra_meta,
        ),
    )

    provenance.write(layout_meta_path_for(path))
    return LayoutArtifact(xy=xy, row_id=row_id, provenance=provenance)
