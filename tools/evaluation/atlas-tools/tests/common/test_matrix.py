import json

import numpy as np
import pytest

from atlas_tools.common.matrix import load_matrix, meta_path_for, write_matrix


def test_roundtrip(tmp_path):
    rng = np.random.default_rng(0)
    original = rng.standard_normal((17, 5)).astype(np.float32)
    path = tmp_path / "emb.f32"
    write_matrix(path, original, producer="test")

    loaded, meta = load_matrix(path, verify_hash=True)
    np.testing.assert_array_equal(loaded, original)
    assert meta.rows == 17
    assert meta.dim == 5
    assert meta.dtype == "f32"
    assert meta.byte_order == "little"


def test_size_mismatch_names_mismatch(tmp_path):
    path = tmp_path / "emb.f32"
    write_matrix(path, np.zeros((4, 3), dtype=np.float32), producer="test")
    # Truncate the binary without touching the sidecar.
    data = path.read_bytes()
    path.write_bytes(data[:-4])

    with pytest.raises(ValueError, match=r"file size mismatch.*rows=4.*dim=3"):
        load_matrix(path)


def test_rejects_unsupported_dtype_and_byte_order(tmp_path):
    path = tmp_path / "emb.f32"
    write_matrix(path, np.zeros((2, 2), dtype=np.float32), producer="test")
    meta_path = meta_path_for(path)

    meta = json.loads(meta_path.read_text())
    meta["dtype"] = "f64"
    meta_path.write_text(json.dumps(meta))
    with pytest.raises(ValueError, match="dtype"):
        load_matrix(path)

    meta["dtype"] = "f32"
    meta["byte_order"] = "big"
    meta_path.write_text(json.dumps(meta))
    with pytest.raises(ValueError, match="byte_order"):
        load_matrix(path)


def test_missing_sidecar_fields_rejected(tmp_path):
    path = tmp_path / "emb.f32"
    write_matrix(path, np.zeros((2, 2), dtype=np.float32), producer="test")
    meta_path = meta_path_for(path)
    meta = json.loads(meta_path.read_text())
    del meta["rows"]
    meta_path.write_text(json.dumps(meta))
    with pytest.raises(ValueError, match="rows"):
        load_matrix(path)


def test_sidecar_is_flat_and_appends_to_filename(tmp_path):
    # PRD section 0.1 pins a FLAT sidecar named <binary filename>.meta.json;
    # the Rust consumer reads this exact shape.
    path = tmp_path / "emb.f32"
    write_matrix(path, np.zeros((2, 3), dtype=np.float32), producer="test")

    meta_path = meta_path_for(path)
    assert meta_path.name == "emb.f32.meta.json"

    raw = json.loads(meta_path.read_text())
    assert "details" not in raw
    for key in (
        "dtype",
        "dim",
        "rows",
        "byte_order",
        "content_sha256",
        "producer",
        "created_at",
    ):
        assert key in raw, key


def test_minimal_foreign_sidecar_accepted(tmp_path):
    # A sidecar with only the PRD-required fields (e.g. written by the Rust
    # producer, no tool_version) must load.
    path = tmp_path / "emb.f32"
    write_matrix(path, np.zeros((2, 3), dtype=np.float32), producer="test")
    meta_path = meta_path_for(path)
    raw = json.loads(meta_path.read_text())
    minimal = {
        key: raw[key]
        for key in (
            "dtype",
            "dim",
            "rows",
            "byte_order",
            "content_sha256",
            "producer",
            "created_at",
        )
    }
    meta_path.write_text(json.dumps(minimal))

    loaded, meta = load_matrix(path, verify_hash=True)
    assert loaded.shape == (2, 3)
    assert meta.dim == 3


def test_hash_verification_detects_corruption(tmp_path):
    path = tmp_path / "emb.f32"
    write_matrix(path, np.ones((2, 2), dtype=np.float32), producer="test")
    raw = bytearray(path.read_bytes())
    raw[0] ^= 0xFF
    path.write_bytes(bytes(raw))
    with pytest.raises(ValueError, match="content hash mismatch"):
        load_matrix(path, verify_hash=True)
    # Without verification the size still matches, so it loads.
    load_matrix(path, verify_hash=False)
