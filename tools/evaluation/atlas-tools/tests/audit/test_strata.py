"""Stratified reporting: a group whose signal truncation destroys is flagged.

Group "low" (660 rows, 60 clusters of 11) carries its signal in dims 0..112,
which a d=256 prefix keeps. Group "high" (220 rows, 20 clusters of 11)
carries its signal in dims 400..512, which a d=256 prefix destroys. With k=10
and 10 same-cluster mates per query, full-vector and kept-prefix top-10 are
exactly the cluster mates, so group "high" degrades ~1.0 while overall
degradation stays near 0.25 — well past the 2x flag threshold.
"""

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from atlas_tools.audit.runner import run_audit
from atlas_tools.audit.synth import make_synthetic
from atlas_tools.common.matrix import write_matrix


def test_group_destroyed_by_truncation_is_flagged(tmp_path):
    low, _ = make_synthetic(660, 512, n_clusters=60, signal_band=(0, 112), seed=1)
    high, _ = make_synthetic(220, 512, n_clusters=20, signal_band=(400, 512), seed=2)
    vectors = np.vstack([low, high])
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

    groups = report["groups"]["band"]
    assert groups["high"]["n_queries"] == 220
    assert groups["low"]["n_queries"] == 660

    # The truncated group's recall collapses; the kept group's does not.
    high_recall = groups["high"]["metrics"]["256"]["10"]["recall"]
    low_recall = groups["low"]["metrics"]["256"]["10"]["recall"]
    assert high_recall < low_recall
    assert low_recall > 0.8
    assert high_recall < 0.2

    flagged = [(f["column"], f["value"], f["dim"], f["k"]) for f in report["flags"]]
    assert ("band", "high", 256, 10) in flagged
    assert all(value != "low" for _, value, _, _ in flagged)
