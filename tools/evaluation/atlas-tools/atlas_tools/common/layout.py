"""Layout artifact contract (PRD section 0.2).

A layout is ``layout.npz`` with ``xy`` (n, 2) float32 and ``row_id`` (n,)
int64, plus a sidecar ``layout.meta.json`` recording engine, config hash,
seed, and source-embedding hash. Consumers (the battery) read ONLY this
format and never import engine code.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from pydantic import BaseModel
from pydantic.config import JsonDict

from atlas_tools.common.provenance import (
    Provenance,
    make_provenance,
    sha256_file,
)


def layout_meta_path_for(path: Path | str) -> Path:
    path = Path(path)
    stem = path.name[: -len(".npz")] if path.name.endswith(".npz") else path.name
    return path.with_name(stem + ".meta.json")


class LayoutDetails(BaseModel):
    engine: str
    rows: int

    layout_sha256: str
    source_embedding_hash: str | None

    extra: JsonDict | None


LayoutProvenance = Provenance[LayoutDetails]


@dataclass(frozen=True)
class LayoutArtifact:
    xy: np.ndarray
    row_id: np.ndarray

    provenance: LayoutProvenance | None


def load_layout(path: Path | str) -> LayoutArtifact:
    """Load and validate a ``layout.npz`` artifact plus its sidecar."""
    path = Path(path)

    with np.load(path) as npz:
        if "xy" not in npz or "row_id" not in npz:
            raise ValueError(
                f"{path}: layout.npz must contain 'xy' and 'row_id' arrays,"
                f" found {sorted(npz.files)}"
            )

        xy = np.asarray(npz["xy"])
        row_id = np.asarray(npz["row_id"])

    if xy.ndim != 2 or xy.shape[1] != 2:
        raise ValueError(f"{path}: 'xy' must have shape (n, 2), got {xy.shape}")

    if xy.dtype != np.float32:
        raise ValueError(f"{path}: 'xy' must be float32, got {xy.dtype}")

    if row_id.ndim != 1:
        raise ValueError(f"{path}: 'row_id' must have shape (n,), got {row_id.shape}")

    if row_id.dtype != np.int64:
        raise ValueError(f"{path}: 'row_id' must be int64, got {row_id.dtype}")

    if row_id.shape[0] != xy.shape[0]:
        raise ValueError(
            f"{path}: row count mismatch: xy has {xy.shape[0]} rows,"
            f" row_id has {row_id.shape[0]}"
        )

    if not np.isfinite(xy).all():
        raise ValueError(f"{path}: 'xy' contains non-finite values")

    meta_path = layout_meta_path_for(path)

    # TODO: shouldn't this hard error?
    provenance = LayoutProvenance.load(meta_path) if meta_path.exists() else None
    return LayoutArtifact(xy=xy, row_id=row_id, provenance=provenance)


def write_layout(
    path: Path | str,
    xy: np.ndarray,
    row_id: np.ndarray | None = None,
    *,
    engine: str,
    config: dict[str, Any] | None = None,
    seed: int | None = None,
    source_embedding_hash: str | None = None,
    extra_meta: JsonDict | None = None,
) -> LayoutArtifact:
    """Write ``layout.npz`` plus ``layout.meta.json``."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    xy = np.ascontiguousarray(xy, dtype=np.float32)
    if xy.ndim != 2 or xy.shape[1] != 2:
        raise ValueError(f"'xy' must have shape (n, 2), got {xy.shape}")

    if row_id is None:
        row_id = np.arange(xy.shape[0], dtype=np.int64)

    row_id = np.ascontiguousarray(row_id, dtype=np.int64)
    if row_id.shape != (xy.shape[0],):
        raise ValueError(
            f"'row_id' must have shape ({xy.shape[0]},), got {row_id.shape}"
        )

    np.savez(path, xy=xy, row_id=row_id)

    provenance = make_provenance(
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
