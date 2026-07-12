from pathlib import Path

import numpy as np
import pytest

from atlas_tools.common.layout import load_layout, write_layout


def test_roundtrip_with_sidecar(tmp_path: Path) -> None:
    xy = np.array([[0.0, 1.0], [2.0, 3.0]], dtype=np.float32)
    path = tmp_path / "layout.npz"
    write_layout(
        path,
        xy,
        engine="test-engine",
        config={"a": 1},
        seed=7,
        source_embedding_hash="deadbeef",
    )

    artifact = load_layout(path)
    np.testing.assert_array_equal(artifact.xy, xy)
    np.testing.assert_array_equal(artifact.row_id, np.array([0, 1], dtype=np.int64))
    assert artifact.provenance is not None
    assert artifact.provenance.details.engine == "test-engine"
    assert artifact.provenance.seed == 7
    assert artifact.provenance.details.source_embedding_hash == "deadbeef"
    assert artifact.provenance.config_hash is not None


def test_missing_sidecar_fails_closed(tmp_path: Path) -> None:
    path = tmp_path / "layout.npz"
    np.savez(
        path,
        xy=np.zeros((3, 2), dtype=np.float32),
        row_id=np.arange(3, dtype=np.int64),
    )

    with pytest.raises(ValueError, match="missing sidecar"):
        load_layout(path)

    artifact = load_layout(path, require_provenance=False)
    assert artifact.provenance is None


def test_shape_and_dtype_validation(tmp_path: Path) -> None:
    path = tmp_path / "layout.npz"
    np.savez(
        path,
        xy=np.zeros((3, 2), dtype=np.float64),
        row_id=np.arange(3, dtype=np.int64),
    )
    with pytest.raises(ValueError, match="float32"):
        load_layout(path)

    np.savez(
        path,
        xy=np.zeros((3, 2), dtype=np.float32),
        row_id=np.arange(2, dtype=np.int64),
    )
    with pytest.raises(ValueError, match="row count mismatch"):
        load_layout(path)

    np.savez(path, xy=np.zeros((3, 2), dtype=np.float32))
    with pytest.raises(ValueError, match="row_id"):
        load_layout(path)


def test_non_finite_rejected(tmp_path: Path) -> None:
    path = tmp_path / "layout.npz"
    xy = np.zeros((2, 2), dtype=np.float32)
    xy[0, 0] = np.nan
    np.savez(path, xy=xy, row_id=np.arange(2, dtype=np.int64))
    with pytest.raises(ValueError, match="non-finite"):
        load_layout(path)
