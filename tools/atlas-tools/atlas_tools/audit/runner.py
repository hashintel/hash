"""Prefix representation audit pipeline.

The audit measures the information ceiling of truncated-and-renormalized embedding
prefixes. Map neighbor recall can never exceed prefix neighbor recall, so prefix recall is
an upper bound for any layout built from the same prefixes.

Pipeline
--------
1. Load the corpus as a memmapped raw f32 matrix
   (:func:`atlas_tools.common.matrix.load_matrix` with ``mmap=True``), so a 1M x 3072
   corpus is never fully materialized as a NumPy array.
2. Sample query rows deterministically::

       np.sort(np.random.default_rng(seed).choice(rows, sample, replace=False))

   All rows are used when ``sample >= rows``. The sha256 of the sampled row indices
   (little-endian int64 bytes) is recorded in provenance.
3. Ground truth: exact cosine top-``(3 * max_k)`` of the full-dimension sampled queries
   against the full corpus, self-excluded, via FAISS ``IndexFlatIP`` in
   :func:`atlas_tools.common.knn.exact_cosine_knn`. Computing top-``(3 * max_k)`` once
   covers the full top-k and full top-(3k) reference lists for every requested k.
4. Candidates: for each prefix dimension ``d``, queries are transformed with
   :func:`atlas_tools.common.knn.prefix_transform` (truncate to the first ``d``
   components, then L2-normalize) and matched against the memmapped column slice
   ``corpus[:, :d]``. Exact search streams normalized corpus blocks through a reusable
   flat FAISS index and merges block-local results with ``faiss.ResultHeap``. The default
   ``auto`` backend uses Metal/CUDA/ROCm when available and otherwise FAISS's multithreaded
   CPU implementation. On Metal, each bounded corpus block runs in a spawned worker because
   FAISS 1.14.3 retains its batch distance buffers for the process lifetime; worker exit
   returns those allocations before the next block starts.

Metric definitions live in :mod:`atlas_tools.audit.metrics`; the definition strings
recorded in ``report.json`` are :data:`atlas_tools.audit.metrics.METRIC_DEFINITIONS`.

Stratified reporting
--------------------
An optional parquet table (loaded into a :class:`~atlas_tools.audit.strata.StrataTable`)
maps corpus ``row`` (integer) to one or more string group columns. For every group column
and value with at least ``min_group_size`` sampled queries, all metrics are reported
restricted to those queries. Degradation is ``1 - recall``; a group is flagged when its
degradation exceeds twice the overall degradation for the same (dim, k).

Outputs
-------
``report.json`` (a serialized :class:`~atlas_tools.audit.evaluation.RunnerReport`) is the
machine-readable source of truth. ``report.md`` is rendered from the ``RunnerReport``
re-validated from the written ``report.json``, so every number in it provably comes from
disk. ``report.meta.json`` is the :class:`~atlas_tools.audit.evaluation.RunnerProvenance`
envelope (input hashes, typed config plus config hash, seed, sample-row hash, tool
version).

Memory and progress
-------------------
The corpus stays memmapped end to end. ``memory_cap_bytes`` plans bounded normalized
corpus batches, flat-index storage, query batches, result heaps, and FAISS score workspace.
For Metal it also bounds each isolated worker's cumulative distance buffers. It is not a hard
RSS cap because caller-owned arrays, mapped file pages, and backend allocator bookkeeping are
outside the function's control. The CLI reports the selected
backend, batch sizes, estimated workspace, completed query/corpus comparisons, throughput,
and ETA for every full and prefix pass.
"""

from collections.abc import Sequence
from os import PathLike
from pathlib import Path

import numpy as np

from atlas_tools.audit.evaluation import (
    ColumnReport,
    FlagReport,
    GroupMetric,
    GroupReport,
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
from atlas_tools.common.data import Dim, K
from atlas_tools.common.knn import (
    DEFAULT_MEMORY_CAP_BYTES,
    RequestedSearchBackend,
    SearchBackend,
    exact_cosine_knn,
    prefix_transform,
    resolve_search_backend,
)
from atlas_tools.common.matrix import load_matrix
from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.common.provenance import (
    sha256_bytes,
    sha256_file,
    write_sidecar,
)

PRODUCER = "atlas-tools audit run"


def _group_metric(metrics: PerQueryMetrics, mask: np.ndarray | None = None) -> GroupMetric:
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
    """Compute per-group metrics and flag groups degrading more than twice overall."""
    groups_report: dict[str, GroupReport] = {}
    flags: list[FlagReport] = []

    for column in sorted(strata.label_columns):
        labels = strata.labels_for(column, sampled)
        values: list[str] = sorted({str(label) for label in labels if label is not None})

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


def sample_rows(rows: int, sample: int, seed: int) -> np.ndarray:
    """Draw ``sample`` sorted distinct row indices, or all rows when ``sample >= rows``.

    Raises ``ValueError`` when ``sample`` is not positive.
    """
    if sample <= 0:
        raise ValueError("sample must be positive")
    if sample >= rows:
        return np.arange(rows, dtype=np.int64)

    rng = np.random.default_rng(seed)
    return np.sort(rng.choice(rows, size=sample, replace=False)).astype(np.int64)


def validated_dims_and_ks(
    dims: Sequence[int],
    ks: Sequence[int],
    *,
    full_dim: int,
    rows: int,
) -> tuple[list[Dim], list[K]]:
    """Deduplicate, sort, and bounds-check the requested prefix dimensions and k values.

    Raises ``ValueError`` when either sequence is empty, when a prefix dimension is out
    of range for the corpus width, when a k value is not positive, or when the largest k
    cannot be satisfied by the self-excluded corpus.
    """
    prefix_dims: list[Dim] = sorted({Dim(value) for value in dims})
    requested_ks: list[K] = sorted({K(value) for value in ks})

    if not prefix_dims or not requested_ks:
        raise ValueError("dims and ks must be non-empty")

    for dim in prefix_dims:
        if not 0 < dim <= full_dim:
            raise ValueError(f"prefix dim {dim} exceeds embedding dim {full_dim}")

    if min(requested_ks) <= 0:
        raise ValueError("k values must be positive")

    max_k = max(requested_ks)
    if max_k > rows - 1:
        raise ValueError(f"k={max_k} too large for corpus with {rows} rows (self-excluded)")

    return prefix_dims, requested_ks


def _prefix_neighbor_indices(
    queries_full: np.ndarray,
    corpus: np.ndarray,
    *,
    prefix_dims: list[Dim],
    max_k: int,
    sampled: np.ndarray,
    memory_cap_bytes: int,
    backend: SearchBackend,
    progress: ProgressReporter,
) -> dict[Dim, np.ndarray]:
    """Compute prefix-space top-``max_k`` neighbor indices for every prefix dimension.

    The corpus side is the lazy memmap slice ``corpus[:, :dim]``; ``exact_cosine_knn``
    normalizes each block in-stream, which on an already-truncated block is exactly the
    prefix transform, so the prefix corpus is never materialized.
    """
    prefix_indices_by_dim: dict[Dim, np.ndarray] = {}
    for dim in prefix_dims:
        queries_prefix = prefix_transform(queries_full, dim)
        prefix_indices, _ = exact_cosine_knn(
            queries_prefix,
            corpus[:, :dim],
            max_k,
            query_rows_in_corpus=sampled,
            memory_cap_bytes=memory_cap_bytes,
            backend=backend,
            progress=progress,
            phase=f"prefix {dim}",
        )

        prefix_indices_by_dim[dim] = prefix_indices

    return prefix_indices_by_dim


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
    backend: RequestedSearchBackend = "auto",
    min_group_size: int = 50,
    progress: ProgressReporter = NO_PROGRESS,
) -> RunnerReport:
    """Run the prefix audit and write ``report.json``, ``report.md``, ``report.meta.json``.

    ``dims`` and ``ks`` are deduplicated and sorted ascending. Returns the
    :class:`RunnerReport` re-validated from the written ``report.json`` (via
    ``model_validate_json``), so every number a caller sees is exactly what is on disk.
    Raises ``ValueError`` when ``sample`` is not positive or when ``dims`` or ``ks`` is
    empty or out of range for the corpus.
    """
    embeddings_file = Path(embeddings_path)
    out_dir = Path(out_dir)

    corpus, matrix_details = load_matrix(embeddings_file, mmap=True)
    rows, full_dim = matrix_details.rows, matrix_details.dim

    prefix_dims, requested_ks = validated_dims_and_ks(dims, ks, full_dim=full_dim, rows=rows)
    max_k = max(requested_ks)
    resolved_backend = resolve_search_backend(backend)

    sampled = sample_rows(rows, sample, seed)
    progress.note(
        f"corpus {rows:,} x {full_dim:,}; {len(sampled):,} sampled queries; "
        f"FAISS backend {resolved_backend}"
    )
    sample_rows_sha256 = sha256_bytes(sampled.astype("<i8").tobytes())
    queries_full = np.ascontiguousarray(corpus[sampled], dtype=np.float32)

    # Ground truth: full-vector top-(3 * max_k), one pass covers every k.
    full_truth_k = 3 * max_k
    full_indices, _ = exact_cosine_knn(
        queries_full,
        corpus,
        full_truth_k,
        query_rows_in_corpus=sampled,
        memory_cap_bytes=memory_cap_bytes,
        backend=resolved_backend,
        progress=progress,
        phase=f"full {full_dim}",
    )

    prefix_indices_by_dim = _prefix_neighbor_indices(
        queries_full,
        corpus,
        prefix_dims=prefix_dims,
        max_k=max_k,
        sampled=sampled,
        memory_cap_bytes=memory_cap_bytes,
        backend=resolved_backend,
        progress=progress,
    )

    per_query: dict[tuple[Dim, K], PerQueryMetrics] = {}
    overall: dict[Dim, dict[K, GroupMetric]] = {}
    for dim in prefix_dims:
        overall[dim] = {}

        for k in requested_ks:
            metrics = per_query_metrics(prefix_indices_by_dim[dim], full_indices, k)
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
        backend=resolved_backend,
        min_group_size=min_group_size,
    )

    report = RunnerReport(
        metric_definitions=METRIC_DEFINITIONS,
        config=config,
        corpus=RunnerCorpus(
            rows=rows,
            dim=full_dim,
            n_sampled=len(sampled),
            full_truth_k=full_truth_k,
        ),
        overall=overall,
        groups=groups_report,
        flags=flags,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = write_sidecar(out_dir / "report.json", report.model_dump(mode="json"))

    # report.json on disk is the source of truth: re-validate it and render report.md
    # from the reloaded model, so every number a caller (or the markdown) sees provably
    # comes from report.json.
    report_from_disk = RunnerReport.model_validate_json(report_path.read_text(encoding="utf-8"))
    (out_dir / "report.md").write_text(render_markdown(report_from_disk), encoding="utf-8")

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
