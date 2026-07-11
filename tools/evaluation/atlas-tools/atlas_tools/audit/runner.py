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
An optional parquet table (loaded into a :class:`~atlas_tools.audit.strata.StrataTable`)
maps corpus ``row`` (integer) to one or more string group columns. For every
group column and value with at least ``min_group_size`` sampled queries, all
metrics are reported restricted to those queries. Degradation is
``1 - recall``; a group is flagged when its degradation exceeds ``2 x`` the
overall degradation for the same (dim, k).

Outputs
-------
``report.json`` (a serialized :class:`~atlas_tools.audit.evaluation.RunnerReport`)
is the machine-readable source of truth. ``report.md`` is rendered from the
``RunnerReport`` re-validated from the written ``report.json``, so every
number in it provably comes from disk. ``report.meta.json`` is the
:class:`~atlas_tools.audit.evaluation.RunnerProvenance` envelope (input
hashes, typed config + config hash, seed, sample-row hash, tool version).

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

from collections.abc import Sequence
from os import PathLike
from pathlib import Path

import numpy as np

from atlas_tools.audit.evaluation import (
    ColumnReport,
    Dim,
    FlagReport,
    GroupMetric,
    GroupReport,
    K,
    RunnerConfig,
    RunnerCorpus,
    RunnerDetails,
    RunnerProvenance,
    RunnerReport,
)
from atlas_tools.audit.metrics import (
    METRIC_DEFINITIONS,
    PerQueryMetrics,
    per_query_metrics,
)
from atlas_tools.audit.report import render_markdown
from atlas_tools.audit.strata import StrataTable
from atlas_tools.common.knn import (
    DEFAULT_MEMORY_CAP_BYTES,
    exact_cosine_knn,
    prefix_transform,
)
from atlas_tools.common.matrix import load_matrix
from atlas_tools.common.provenance import (
    sha256_bytes,
    sha256_file,
    write_sidecar,
)

PRODUCER = "atlas-tools audit run"


def _group_metric(
    metrics: PerQueryMetrics, mask: np.ndarray | None = None
) -> GroupMetric:
    def mean(values: np.ndarray) -> float:
        return float((values if mask is None else values[mask]).mean())

    return GroupMetric(
        recall=mean(metrics.recall),
        intrusion_rate=mean(metrics.intrusion_rate),
        mean_rank_displacement=mean(metrics.mean_rank_displacement),
    )


def _evaluate_strata(
    *,
    strata: StrataTable,
    sampled: np.ndarray,
    dims: list[Dim],
    ks: list[K],
    per_query: dict[tuple[Dim, K], PerQueryMetrics],
    min_group_size: int,
) -> tuple[dict[str, GroupReport], list[FlagReport]]:
    """Per-group metrics plus flags for groups degrading > 2x overall."""
    groups_report: dict[str, GroupReport] = {}
    flags: list[FlagReport] = []

    for column in sorted(strata.label_columns):
        labels = strata.labels_for(column, sampled)
        values: list[str] = sorted(
            {str(label) for label in labels if label is not None}
        )

        column_report: dict[str, ColumnReport] = {}

        for value in values:
            mask = labels == value

            n_queries = int(mask.sum())
            if n_queries < min_group_size:
                continue

            group_metrics: dict[Dim, dict[K, GroupMetric]] = {}
            for dim in dims:
                dim_metrics: dict[K, GroupMetric] = {}
                group_metrics[dim] = dim_metrics

                for k in ks:
                    metrics = per_query[(dim, k)]
                    dim_metrics[k] = _group_metric(metrics, mask)

                    # Flag on unrounded means for exactness.
                    group_recall = float(metrics.recall[mask].mean())
                    overall_recall = float(metrics.recall.mean())
                    group_degradation = 1.0 - group_recall
                    overall_degradation = 1.0 - overall_recall

                    if group_degradation > 2.0 * overall_degradation:
                        flags.append(
                            FlagReport(
                                column=column,
                                value=value,
                                dim=dim,
                                k=k,
                                n_queries=n_queries,
                                group_recall=group_recall,
                                overall_recall=overall_recall,
                                group_degradation=group_degradation,
                                overall_degradation=overall_degradation,
                            )
                        )

            column_report[value] = ColumnReport(
                n_queries=n_queries,
                metrics=group_metrics,
            )

        groups_report[column] = GroupReport(
            columns=column_report,
        )

    return groups_report, flags


def _sample_rows(rows: int, sample: int, seed: int) -> np.ndarray:
    if sample <= 0:
        raise ValueError("sample must be positive")
    if sample >= rows:
        return np.arange(rows, dtype=np.int64)

    rng = np.random.default_rng(seed)
    return np.sort(rng.choice(rows, size=sample, replace=False)).astype(np.int64)


def run_audit(
    embeddings_path: PathLike,
    out_dir: PathLike,
    *,
    dims: Sequence[int],
    ks: Sequence[int],
    sample: int = 20000,
    strata_path: PathLike | None = None,
    seed: int = 0,
    memory_cap_bytes: int = DEFAULT_MEMORY_CAP_BYTES,
    min_group_size: int = 50,
) -> RunnerReport:
    """
    Run the prefix audit and write report.json / report.md / report.meta.json.

    ``dims`` and ``ks`` are deduplicated and sorted ascending. Returns the
    :class:`RunnerReport` re-validated from the written ``report.json``
    (via ``model_validate_json``), so every number a caller sees is exactly
    what is on disk.
    """

    embeddings_file = Path(embeddings_path)
    out_dir = Path(out_dir)

    corpus, matrix_details = load_matrix(embeddings_file, mmap=True)
    rows, full_dim = matrix_details.rows, matrix_details.dim

    prefix_dims: list[Dim] = sorted({Dim(value) for value in dims})
    requested_ks: list[K] = sorted({K(value) for value in ks})

    if not prefix_dims or not requested_ks:
        raise ValueError("dims and ks must be non-empty")

    for dim in prefix_dims:
        if not 0 < dim <= full_dim:
            raise ValueError(f"prefix dim {dim} exceeds embedding dim {full_dim}")

    max_k = max(requested_ks)
    if min(requested_ks) <= 0:
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
    # memmap slice corpus[:, :dim]; exact_cosine_knn normalizes each block
    # in-stream, which on a truncated slice IS the prefix transform.
    prefix_idx_by_dim: dict[Dim, np.ndarray] = {}
    for dim in prefix_dims:
        queries_prefix = prefix_transform(queries_full, dim)
        prefix_idx, _ = exact_cosine_knn(
            queries_prefix,
            corpus[:, :dim],
            max_k,
            query_rows_in_corpus=sampled,
            memory_cap_bytes=memory_cap_bytes,
        )

        prefix_idx_by_dim[dim] = prefix_idx

    per_query: dict[tuple[Dim, K], PerQueryMetrics] = {}
    overall: dict[Dim, dict[K, GroupMetric]] = {}
    for dim in prefix_dims:
        overall[dim] = {}

        for k in requested_ks:
            metrics = per_query_metrics(prefix_idx_by_dim[dim], full_idx, k)
            per_query[(dim, k)] = metrics
            overall[dim][k] = _group_metric(metrics)

    groups_report: dict[str, GroupReport] = {}
    flags: list[FlagReport] = []
    if strata_path is not None:
        groups_report, flags = _evaluate_strata(
            strata=StrataTable.from_parquet(strata_path),
            sampled=sampled,
            dims=prefix_dims,
            ks=requested_ks,
            per_query=per_query,
            min_group_size=min_group_size,
        )

    config = RunnerConfig(
        embeddings=embeddings_file,
        strata=Path(strata_path) if strata_path is not None else None,
        dims=prefix_dims,
        ks=requested_ks,
        sample=sample,
        seed=seed,
        memory_cap_bytes=memory_cap_bytes,
        min_group_size=min_group_size,
    )

    report = RunnerReport(
        metric_definitions=METRIC_DEFINITIONS,
        config=config,
        corpus=RunnerCorpus(
            rows=rows,
            dim=full_dim,
            n_sampled=int(len(sampled)),
            full_truth_k=full_truth_k,
        ),
        overall=overall,
        groups=groups_report,
        flags=flags,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = write_sidecar(out_dir / "report.json", report.model_dump(mode="json"))

    # report.json on disk is the source of truth: re-validate it and render
    # report.md from the reloaded model, so every number a caller (or the
    # markdown) sees provably comes from report.json.
    report_from_disk = RunnerReport.model_validate_json(
        report_path.read_text(encoding="utf-8")
    )
    (out_dir / "report.md").write_text(
        render_markdown(report_from_disk), encoding="utf-8"
    )

    input_hashes = {"embeddings": matrix_details.content_sha256}
    if strata_path is not None:
        input_hashes["strata"] = sha256_file(strata_path)

    provenance = RunnerProvenance.make(
        producer=PRODUCER,
        input_hashes=input_hashes,
        config=config,
        seed=seed,
        details=RunnerDetails(
            sample_rows_sha256=sample_rows_sha256,
            report_sha256=sha256_file(report_path),
        ),
    )
    provenance.write(out_dir / "report.meta.json")

    return report_from_disk
