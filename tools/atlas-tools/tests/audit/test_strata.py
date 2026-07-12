"""Stratified reporting tests: parsing, lookup, and flagging.

Flag test construction: group "low" (660 rows, 60 clusters of 11) carries its signal in
dimensions 0..112, which a d=256 prefix keeps. Group "high" (220 rows, 20 clusters of 11)
carries its signal in dimensions 400..512, which a d=256 prefix destroys. With k=10 and 10
same-cluster mates per query, full-vector and kept-prefix top-10 are exactly the cluster
mates, so group "high" degrades to roughly 1.0 while overall degradation stays near 0.25,
well past the 2x flag threshold.
"""

from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from atlas_tools.audit.evaluation import Dim, K
from atlas_tools.audit.runner import run_audit
from atlas_tools.audit.strata import StrataTable
from atlas_tools.audit.synthetic import make_synthetic
from atlas_tools.common.matrix import write_matrix


def test_group_destroyed_by_truncation_is_flagged(tmp_path: Path) -> None:
    low = make_synthetic(660, 512, n_clusters=60, signal_band=(0, 112), seed=1)
    high = make_synthetic(220, 512, n_clusters=20, signal_band=(400, 512), seed=2)
    vectors = np.vstack([low.vectors, high.vectors])
    n = vectors.shape[0]

    embeddings = tmp_path / "grouped.f32"
    write_matrix(embeddings, vectors, producer="tests.audit")

    strata = tmp_path / "strata.parquet"
    pq.write_table(
        pa.table(
            {
                "row": pa.array(np.arange(n, dtype=np.int64), type=pa.int64()),
                "band": pa.array(["low"] * 660 + ["high"] * 220),
            }
        ),
        strata,
    )

    report = run_audit(
        embeddings,
        tmp_path / "report",
        dims=[256, 512],
        ks=[10],
        sample=n,  # sample >= rows: use all rows
        strata_path=strata,
        seed=0,
        min_group_size=50,
    )

    band_groups = report.groups["band"].columns
    assert band_groups["high"].n_queries == 220
    assert band_groups["low"].n_queries == 660

    # The truncated group's recall collapses; the kept group's does not.
    high_recall = band_groups["high"].metrics[Dim(256)][K(10)].recall
    low_recall = band_groups["low"].metrics[Dim(256)][K(10)].recall
    assert high_recall < low_recall
    assert low_recall > 0.8
    assert high_recall < 0.2

    flagged = [(flag.column, flag.value, flag.dim, flag.k) for flag in report.flags]
    assert ("band", "high", 256, 10) in flagged
    assert all(flag.value != "low" for flag in report.flags)


class TestStrataTableParsing:
    def test_missing_row_column(self, tmp_path: Path) -> None:
        path = tmp_path / "strata.parquet"
        pq.write_table(pa.table({"band": ["a", "b"]}), path)
        with pytest.raises(ValueError, match="no 'row' column"):
            StrataTable.from_parquet(path)

    def test_non_integer_row_column(self, tmp_path: Path) -> None:
        path = tmp_path / "strata.parquet"
        pq.write_table(pa.table({"row": ["0", "1"], "band": ["a", "b"]}), path)
        with pytest.raises(ValueError, match="must be an integer type"):
            StrataTable.from_parquet(path)

    def test_null_row_rejected(self, tmp_path: Path) -> None:
        path = tmp_path / "strata.parquet"
        pq.write_table(
            pa.table(
                {
                    "row": pa.array([0, None], type=pa.int64()),
                    "band": ["a", "b"],
                }
            ),
            path,
        )
        with pytest.raises(ValueError, match="'row' column contains nulls"):
            StrataTable.from_parquet(path)

    def test_duplicate_rows_rejected(self, tmp_path: Path) -> None:
        path = tmp_path / "strata.parquet"
        pq.write_table(pa.table({"row": [0, 0], "band": ["a", "b"]}), path)
        with pytest.raises(ValueError, match="duplicate values in 'row' column"):
            StrataTable.from_parquet(path)

    def test_non_string_group_column(self, tmp_path: Path) -> None:
        path = tmp_path / "strata.parquet"
        pq.write_table(pa.table({"row": [0, 1], "score": [1.5, 2.5]}), path)
        with pytest.raises(ValueError, match="must contain string labels"):
            StrataTable.from_parquet(path)

    def test_no_group_columns(self, tmp_path: Path) -> None:
        path = tmp_path / "strata.parquet"
        pq.write_table(pa.table({"row": [0, 1]}), path)
        with pytest.raises(ValueError, match="no group columns besides 'row'"):
            StrataTable.from_parquet(path)

    def test_labels_for_handles_unsorted_missing_and_null(self, tmp_path: Path) -> None:
        path = tmp_path / "strata.parquet"
        # Rows arrive unsorted; row 1 is absent; row 3's label is null.
        pq.write_table(
            pa.table(
                {
                    "row": pa.array([2, 0, 3], type=pa.int64()),
                    "band": pa.array(["b", "a", None]),
                }
            ),
            path,
        )
        strata = StrataTable.from_parquet(path)
        labels = strata.labels_for("band", np.array([0, 1, 2, 3], dtype=np.int64))
        assert labels.tolist() == ["a", None, "b", None]
