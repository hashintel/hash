"""PostgreSQL embedding and strata export tests."""

import io
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import pytest

from atlas_tools.audit.postgres import ExportBatch, _write_export_batches


def _batch(
    embeddings: np.ndarray,
    *,
    web_ids: list[str] | None = None,
    type_titles: list[str | None] | None = None,
    type_base_urls: list[str | None] | None = None,
) -> ExportBatch:
    rows = int(embeddings.shape[0])
    return ExportBatch(
        embeddings=embeddings,
        web_ids=web_ids if web_ids is not None else [f"web-{index}" for index in range(rows)],
        entity_type_titles=type_titles if type_titles is not None else ["Person"] * rows,
        entity_type_base_urls=(
            type_base_urls if type_base_urls is not None else ["https://example.com/person/"] * rows
        ),
    )


def test_export_batches_write_matrix_and_aligned_strata(tmp_path: Path) -> None:
    blocks = [
        _batch(
            np.array([[1.25, -2.5, 3.75]], dtype=np.float64),
            web_ids=["web-a"],
            type_titles=["Person"],
            type_base_urls=["https://example.com/person/"],
        ),
        _batch(
            np.array([[4.5, 5.25, -6.0], [7.0, 8.0, 9.0]], dtype=np.float32),
            web_ids=["web-b", "web-b"],
            type_titles=["Organization", None],
            type_base_urls=["https://example.com/organization/", None],
        ),
    ]
    output = io.BytesIO()
    strata = tmp_path / "strata.parquet"

    result = _write_export_batches(blocks, output, strata_path=strata)

    actual = np.frombuffer(output.getvalue(), dtype="<f4").reshape(3, 3)
    np.testing.assert_array_equal(
        actual,
        np.vstack([block.embeddings for block in blocks]).astype(np.float32),
    )
    assert result.rows == 3
    assert result.dim == 3
    assert len(result.content_sha256) == 64

    table = pq.read_table(strata).to_pydict()
    assert table == {
        "row": [0, 1, 2],
        "web_id": ["web-a", "web-b", "web-b"],
        "entity_type_title": ["Person", "Organization", None],
        "entity_type_base_url": [
            "https://example.com/person/",
            "https://example.com/organization/",
            None,
        ],
    }


def test_export_batches_reject_dimension_changes() -> None:
    blocks = [
        _batch(np.zeros((1, 3), dtype=np.float32)),
        _batch(np.zeros((1, 4), dtype=np.float32)),
    ]

    with pytest.raises(ValueError, match="dimension changed from 3 to 4"):
        _write_export_batches(blocks, io.BytesIO())


def test_export_batches_reject_misaligned_strata(tmp_path: Path) -> None:
    batch = _batch(np.zeros((2, 3), dtype=np.float32), web_ids=["web-a"])

    with pytest.raises(ValueError, match="strata labels are not aligned"):
        _write_export_batches(
            [batch],
            io.BytesIO(),
            strata_path=tmp_path / "strata.parquet",
        )


def test_export_batches_reject_empty_export() -> None:
    with pytest.raises(ValueError, match="no whole-entity embeddings"):
        _write_export_batches([], io.BytesIO())
