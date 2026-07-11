"""Prefix representation audit pipeline (PRD W1).

Purpose: measure the information ceiling of truncated-and-renormalized
embedding prefixes. Map neighbor recall can never exceed prefix neighbor
recall; every projector gate downstream references this number.

Pipeline
--------
1. Load the corpus as a memmapped raw f32 matrix
   (:func:`atlas_tools.common.matrix.load_matrix` with ``mmap=True``), so a
   1M x 3072 corpus is never fully resident.
2. Sample query rows deterministically::

       np.sort(np.random.default_rng(seed).choice(rows, sample, replace=False))

   All rows are used when ``sample >= rows``. The sha256 of the sampled row
   indices (little-endian int64 bytes) is recorded in provenance.
3. Ground truth: exact cosine top-``(3 * max_k)`` of the FULL-dimension
   sampled queries against the full corpus, self-excluded, via
   :func:`atlas_tools.common.knn.exact_cosine_knn` (blockwise; never
   materializes a q x n matrix). Computing top-``(3 * max_k)`` once covers
   the full top-k and full top-(3k) reference lists for every requested k.
4. Candidates: for each prefix dim ``d``, queries are transformed with
   :func:`atlas_tools.common.knn.prefix_transform` (truncate to the first
   ``d`` components, THEN L2-normalize) and matched against the memmapped
   column slice ``corpus[:, :d]``. Slicing a memmap keeps it lazy, and
   ``exact_cosine_knn`` L2-normalizes each corpus block in-stream — on an
   already-truncated block that is exactly the prefix transform — so the
   prefix corpus is never materialized either.

Metric definitions (exact; embedded verbatim in report.json/report.md)
----------------------------------------------------------------------
- ``recall@k(d)``: mean over queries of ``|prefix_topk ∩ full_topk| / k``.
- ``intrusion_rate@k(d)``: mean over queries of the fraction of prefix top-k
  neighbors NOT in the full top-(3k).
- ``mean_rank_displacement@k(d)``: mean over queries and over prefix top-k
  neighbors of ``max(rank_full - rank_prefix, 0)``, where ``rank_prefix`` is
  the neighbor's 0-based position in the prefix list and ``rank_full`` is its
  0-based position in the full top-(3k) list, or ``3k`` if absent.

Stratified reporting
--------------------
An optional parquet table maps corpus ``row`` (int64) to one or more string /
categorical group columns. For every group column and value with at least
``min_group_size`` sampled queries, all metrics are reported restricted to
those queries. Degradation is ``1 - recall``; a group is flagged when its
degradation exceeds ``2 x`` the overall degradation for the same (dim, k).

Scale: 1M x 3072 corpus on a 32 GB machine
------------------------------------------
The corpus stays memmapped end to end. The only large transient is the
per-block score matrix inside ``exact_cosine_knn``, whose block size is

    b = memory_cap_bytes // (4 * (n_queries + dim))

(see that module's docstring for the derivation). With q=20_000 sampled
queries, d=3072 and the default 8 GiB cap, b ≈ 93_000 corpus rows per block
(~11 blocks for a 1M-row corpus) and the peak score transient is
q * b * 4 ≈ 7.4 GB — comfortably inside 32 GB alongside the 245 MB
materialized query block. Prefix passes are strictly cheaper: smaller d
gives a larger b with the same q * b * 4 score budget.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from atlas_tools.audit.metrics import (
    METRIC_DEFINITIONS,
    PerQueryMetrics,
    per_query_metrics,
)
from atlas_tools.audit.report import render_markdown
from atlas_tools.common.knn import (
    DEFAULT_MEMORY_CAP_BYTES,
    exact_cosine_knn,
    prefix_transform,
)
from atlas_tools.common.matrix import load_matrix
from atlas_tools.common.provenance import (
    provenance_block,
    sha256_bytes,
    sha256_file,
    write_sidecar,
)

PRODUCER = "atlas-tools audit run"


def _round6(value: float) -> float:
    return round(float(value), 6)


def _metric_dict(metrics: PerQueryMetrics, mask: np.ndarray | None = None) -> dict:
    def mean(values: np.ndarray) -> float:
        return _round6((values if mask is None else values[mask]).mean())

    return {
        "recall": mean(metrics.recall),
        "intrusion_rate": mean(metrics.intrusion_rate),
        "mean_rank_displacement": mean(metrics.mean_rank_displacement),
    }


def load_strata(path: Path | str) -> dict[str, dict[int, str]]:
    """Load a strata parquet: int64 ``row`` column plus group columns.

    Returns ``{column_name: {row: label}}``; null labels are skipped.
    """
    import pyarrow.parquet as pq

    table = pq.read_table(path)
    if "row" not in table.column_names:
        raise ValueError(f"strata table {path} has no 'row' column")
    rows = table.column("row").to_pylist()
    if any(not isinstance(r, int) for r in rows):
        raise ValueError(f"strata table {path}: 'row' column must be integer")
    if len(set(rows)) != len(rows):
        raise ValueError(f"strata table {path}: duplicate values in 'row' column")

    out: dict[str, dict[int, str]] = {}
    for name in table.column_names:
        if name == "row":
            continue
        mapping: dict[int, str] = {}
        for row, value in zip(rows, table.column(name).to_pylist()):
            if value is None:
                continue
            mapping[int(row)] = str(value)
        out[name] = mapping
    if not out:
        raise ValueError(f"strata table {path} has no group columns besides 'row'")
    return out


def _evaluate_strata(
    strata: dict[str, dict[int, str]],
    sampled: np.ndarray,
    dims: list[int],
    ks: list[int],
    per_query: dict[tuple[int, int], PerQueryMetrics],
    min_group_size: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Per-group metrics plus flags for groups degrading > 2x overall."""
    groups_report: dict[str, Any] = {}
    flags: list[dict[str, Any]] = []
    for column in sorted(strata):
        mapping = strata[column]
        labels = [mapping.get(int(row)) for row in sampled]
        column_report: dict[str, Any] = {}
        for value in sorted({lab for lab in labels if lab is not None}):
            mask = np.fromiter(
                (lab == value for lab in labels), dtype=bool, count=len(labels)
            )
            n_queries = int(mask.sum())
            if n_queries < min_group_size:
                continue
            group_metrics: dict[str, Any] = {}
            for d in dims:
                group_metrics[str(d)] = {}
                for k in ks:
                    metrics = per_query[(d, k)]
                    group_metrics[str(d)][str(k)] = _metric_dict(metrics, mask)
                    # Flag on unrounded means for exactness.
                    group_recall = float(metrics.recall[mask].mean())
                    overall_recall = float(metrics.recall.mean())
                    group_deg = 1.0 - group_recall
                    overall_deg = 1.0 - overall_recall
                    if group_deg > 2.0 * overall_deg:
                        flags.append(
                            {
                                "column": column,
                                "value": value,
                                "dim": d,
                                "k": k,
                                "n_queries": n_queries,
                                "group_recall": _round6(group_recall),
                                "overall_recall": _round6(overall_recall),
                                "group_degradation": _round6(group_deg),
                                "overall_degradation": _round6(overall_deg),
                            }
                        )
            column_report[value] = {
                "n_queries": n_queries,
                "metrics": group_metrics,
            }
        groups_report[column] = column_report
    return groups_report, flags


def _sample_rows(rows: int, sample: int, seed: int) -> np.ndarray:
    if sample <= 0:
        raise ValueError("sample must be positive")
    if sample >= rows:
        return np.arange(rows, dtype=np.int64)
    rng = np.random.default_rng(seed)
    return np.sort(rng.choice(rows, size=sample, replace=False)).astype(np.int64)


def run_audit(
    embeddings_path: Path | str,
    out_dir: Path | str,
    *,
    dims: list[int],
    ks: list[int],
    sample: int = 20000,
    strata_path: Path | str | None = None,
    seed: int = 0,
    memory_cap_bytes: int = DEFAULT_MEMORY_CAP_BYTES,
    min_group_size: int = 50,
) -> dict[str, Any]:
    """Run the prefix audit and write report.json / report.md / report.meta.json.

    Returns the report dict as loaded back from the written ``report.json``.
    """
    embeddings_path = Path(embeddings_path)
    out_dir = Path(out_dir)

    corpus, meta = load_matrix(embeddings_path, mmap=True)
    rows, full_dim = meta.rows, meta.dim

    dims = sorted(set(int(d) for d in dims))
    ks = sorted(set(int(k) for k in ks))
    if not dims or not ks:
        raise ValueError("dims and ks must be non-empty")
    for d in dims:
        if not 0 < d <= full_dim:
            raise ValueError(f"prefix dim {d} exceeds embedding dim {full_dim}")
    max_k = max(ks)
    if min(ks) <= 0:
        raise ValueError("k values must be positive")
    if max_k > rows - 1:
        raise ValueError(
            f"k={max_k} too large for corpus with {rows} rows (self-excluded)"
        )

    sampled = _sample_rows(rows, sample, seed)
    sample_rows_sha256 = sha256_bytes(sampled.astype("<i8").tobytes())
    queries_full = np.ascontiguousarray(corpus[sampled], dtype=np.float32)

    # Ground truth: full-vector top-(3 * max_k), one pass covers every k.
    full_truth_k = 3 * max_k
    full_idx, _ = exact_cosine_knn(
        queries_full,
        corpus,
        full_truth_k,
        query_rows_in_corpus=sampled,
        memory_cap_bytes=memory_cap_bytes,
    )

    # Candidates: prefix-space top-max_k per dim. The corpus side is the lazy
    # memmap slice corpus[:, :d]; exact_cosine_knn normalizes each block
    # in-stream, which on a truncated slice IS the prefix transform.
    prefix_idx_by_dim: dict[int, np.ndarray] = {}
    for d in dims:
        queries_d = prefix_transform(queries_full, d)
        prefix_idx, _ = exact_cosine_knn(
            queries_d,
            corpus[:, :d],
            max_k,
            query_rows_in_corpus=sampled,
            memory_cap_bytes=memory_cap_bytes,
        )
        prefix_idx_by_dim[d] = prefix_idx

    per_query: dict[tuple[int, int], PerQueryMetrics] = {}
    overall: dict[str, dict[str, dict[str, float]]] = {}
    for d in dims:
        overall[str(d)] = {}
        for k in ks:
            metrics = per_query_metrics(prefix_idx_by_dim[d], full_idx, k)
            per_query[(d, k)] = metrics
            overall[str(d)][str(k)] = _metric_dict(metrics)

    groups_report: dict[str, Any] = {}
    flags: list[dict[str, Any]] = []
    if strata_path is not None:
        groups_report, flags = _evaluate_strata(
            load_strata(strata_path), sampled, dims, ks, per_query, min_group_size
        )

    config = {
        "embeddings": str(embeddings_path),
        "strata": str(strata_path) if strata_path is not None else None,
        "dims": dims,
        "ks": ks,
        "sample": sample,
        "seed": seed,
        "memory_cap_bytes": int(memory_cap_bytes),
        "min_group_size": min_group_size,
    }
    report = {
        "metric_definitions": METRIC_DEFINITIONS,
        "config": config,
        "corpus": {
            "rows": rows,
            "dim": full_dim,
            "n_sampled": int(len(sampled)),
            "full_truth_k": full_truth_k,
        },
        "overall": overall,
        "groups": groups_report,
        "flags": flags,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "report.json"
    report_path.write_text(
        json.dumps(report, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # report.md is rendered from the loaded report.json dict so every number
    # in it provably comes from report.json.
    loaded = json.loads(report_path.read_text(encoding="utf-8"))
    (out_dir / "report.md").write_text(render_markdown(loaded), encoding="utf-8")

    inputs = {"embeddings": meta.content_sha256}
    if strata_path is not None:
        inputs["strata"] = sha256_file(strata_path)
    write_sidecar(
        out_dir / "report.meta.json",
        provenance_block(
            producer=PRODUCER,
            inputs=inputs,
            config=config,
            seed=seed,
            extra={
                "sample_rows_sha256": sample_rows_sha256,
                "report_sha256": sha256_file(report_path),
            },
        ),
    )
    return loaded
