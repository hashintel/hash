"""Clump-collapsed prefix recall over an audit corpus.

Near-tie clumps are epsilon-connected components over a prefix-space k-NN
table: an edge joins rows ``i`` and ``j`` when either row stores the other at
doubled-cosine distance (``1 - cos``, the [0, 2] scale) at most ``epsilon``.
Collapsed recall maps both top-k lists to clump labels and counts the sorted
multiset intersection: each reference neighbour is matched by a distinct
retrieved neighbour from the same clump, so a clump the retrieval shows fewer
members of earns exactly the members shown. Singleton labels reproduce plain
recall exactly, and collapsed recall never reads below plain recall.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from os import PathLike
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

from atlas_tools.audit.runner import sample_rows, validated_dims_and_ks
from atlas_tools.audit.strata import StrataTable
from atlas_tools.common.knn import (
    DEFAULT_MEMORY_CAP_BYTES,
    RequestedSearchBackend,
    exact_cosine_knn,
    prefix_transform,
    resolve_search_backend,
)
from atlas_tools.common.matrix import load_matrix
from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.common.provenance import sha256_bytes, write_sidecar

PRODUCER = "atlas-tools audit clump-recall"


class ClumpShape(BaseModel):
    """Describe the epsilon-connected-component grouping over the corpus."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    multi_groups: int
    grouped_rows: int
    singleton_rows: int
    mean_multi_group_size: float


class PlainCollapsed(BaseModel):
    """One recall pair: identity labels beside clump-collapsed labels."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    plain: float
    collapsed: float


class ClumpColumnReport(BaseModel):
    """Recall pairs for one stratum value across the requested k values."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    n_queries: int
    metrics: dict[int, PlainCollapsed]


class ClumpRecallReport(BaseModel):
    """The machine-readable clump-collapsed recall result."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    dim: int
    ks: list[int]
    epsilon: float
    label_k: int
    sample: int
    seed: int
    corpus_rows: int
    corpus_dim: int
    sample_rows_sha256: str
    label_table_sha256: str
    shape: ClumpShape
    overall: dict[int, PlainCollapsed]
    groups: dict[str, dict[str, ClumpColumnReport]]


def clump_labels(
    neighbor_indices: np.ndarray,
    doubled_cosine_distances: np.ndarray,
    *,
    epsilon: float,
) -> np.ndarray:
    """Label every corpus row with its epsilon-connected-component id.

    ``neighbor_indices`` is the ``(rows, k)`` prefix-space neighbour table and
    ``doubled_cosine_distances`` its aligned ``1 - cos`` distances on the
    [0, 2] scale. An edge joins a row and a stored neighbour whenever the
    stored distance is at most ``epsilon``; connectivity is undirected, so
    either endpoint storing the other suffices. Raises ``ValueError`` on shape
    mismatch or a non-positive ``epsilon``.
    """
    if epsilon <= 0:
        raise ValueError("epsilon must be positive")
    if neighbor_indices.shape != doubled_cosine_distances.shape:
        raise ValueError(
            f"neighbour table shapes disagree: indices {neighbor_indices.shape}, "
            f"distances {doubled_cosine_distances.shape}"
        )

    rows = neighbor_indices.shape[0]
    within = doubled_cosine_distances <= epsilon
    sources = np.repeat(np.arange(rows, dtype=np.int64), neighbor_indices.shape[1])[within.ravel()]
    targets = neighbor_indices.ravel()[within.ravel()].astype(np.int64)

    adjacency = coo_matrix(
        (np.ones(len(sources), dtype=np.int8), (sources, targets)),
        shape=(rows, rows),
    )
    _components, labels = connected_components(adjacency, directed=False)
    return labels.astype(np.int64)


def clump_shape(labels: np.ndarray) -> ClumpShape:
    """Summarize group counts, mean multi-group size, and singleton volume."""
    _values, counts = np.unique(labels, return_counts=True)
    multi = counts[counts > 1]
    return ClumpShape(
        multi_groups=len(multi),
        grouped_rows=int(multi.sum()),
        singleton_rows=int((counts == 1).sum()),
        mean_multi_group_size=float(multi.mean()) if len(multi) else 0.0,
    )


def collapsed_recall_per_query(
    prefix_indices: np.ndarray,
    full_indices: np.ndarray,
    labels: np.ndarray,
    k: int,
) -> np.ndarray:
    """Score each query's top-``k`` agreement at clump granularity.

    Both lists are mapped to clump labels and scored by sorted multiset
    intersection over k: duplicates count up to their multiplicity, so a
    clump the retrieval shows fewer members of earns exactly the members
    shown. Raises ``ValueError`` when ``k`` is not positive or either list
    has fewer than ``k`` columns.
    """
    if k <= 0:
        raise ValueError("k must be positive")
    if prefix_indices.shape[1] < k or full_indices.shape[1] < k:
        raise ValueError(
            f"neighbour lists need at least {k} columns; have "
            f"{prefix_indices.shape[1]} and {full_indices.shape[1]}"
        )

    prefix_labels = labels[prefix_indices[:, :k]]
    full_labels = labels[full_indices[:, :k]]

    matched = np.empty(len(prefix_labels), dtype=np.float64)
    for query in range(len(prefix_labels)):
        retrieved_values, retrieved_counts = np.unique(prefix_labels[query], return_counts=True)
        reference_values, reference_counts = np.unique(full_labels[query], return_counts=True)
        _common, retrieved_at, reference_at = np.intersect1d(
            retrieved_values,
            reference_values,
            assume_unique=True,
            return_indices=True,
        )
        matched[query] = np.minimum(
            retrieved_counts[retrieved_at],
            reference_counts[reference_at],
        ).sum()

    return matched / k


@dataclass(frozen=True, slots=True, kw_only=True)
class _ScoredQueries:
    plain: dict[int, np.ndarray]
    collapsed: dict[int, np.ndarray]


def _plain_recall_per_query(
    prefix_indices: np.ndarray,
    full_indices: np.ndarray,
    k: int,
) -> np.ndarray:
    identity = np.arange(int(full_indices.max()) + 1, dtype=np.int64)
    return collapsed_recall_per_query(prefix_indices, full_indices, identity, k)


def _pair(plain: np.ndarray, collapsed: np.ndarray, mask: np.ndarray | None) -> PlainCollapsed:
    def mean(values: np.ndarray) -> float:
        return float((values if mask is None else values[mask]).mean())

    return PlainCollapsed(plain=mean(plain), collapsed=mean(collapsed))


def _grouped(
    strata: StrataTable,
    sampled: np.ndarray,
    scored: _ScoredQueries,
    *,
    ks: Sequence[int],
    min_group_size: int,
) -> dict[str, dict[str, ClumpColumnReport]]:
    groups: dict[str, dict[str, ClumpColumnReport]] = {}
    for column in sorted(strata.label_columns):
        labels = strata.labels_for(column, sampled)
        values = sorted({str(label) for label in labels if label is not None})

        column_report: dict[str, ClumpColumnReport] = {}
        for value in values:
            mask = labels == value
            n_queries = int(mask.sum())
            if n_queries < min_group_size:
                continue
            column_report[value] = ClumpColumnReport(
                n_queries=n_queries,
                metrics={k: _pair(scored.plain[k], scored.collapsed[k], mask) for k in ks},
            )
        groups[column] = column_report
    return groups


def run_clump_recall(
    embeddings_path: PathLike,
    out_dir: PathLike,
    *,
    dim: int,
    ks: Sequence[int],
    epsilon: float,
    label_k: int = 30,
    sample: int = 20_000,
    seed: int = 0,
    strata_path: PathLike | None = None,
    expected_sample_rows_sha256: str | None = None,
    memory_cap_bytes: int = DEFAULT_MEMORY_CAP_BYTES,
    backend: RequestedSearchBackend = "auto",
    min_group_size: int = 50,
    progress: ProgressReporter = NO_PROGRESS,
) -> ClumpRecallReport:
    """Re-score the seeded audit sample at clump granularity and publish the report.

    The query sample is regenerated from ``seed`` exactly as the audit runner
    draws it; ``expected_sample_rows_sha256`` cross-checks row alignment
    against the recorded audit provenance and fails loudly on mismatch. Clump
    labels come from a whole-corpus prefix-space top-``label_k`` table built
    on the same corpus bytes. Raises ``ValueError`` on config or alignment
    violations.
    """
    out_dir = Path(out_dir)
    corpus, matrix_details = load_matrix(Path(embeddings_path), mmap=True)
    rows, full_dim = matrix_details.rows, matrix_details.dim
    [validated_dim], validated_ks = validated_dims_and_ks([dim], ks, full_dim=full_dim, rows=rows)
    max_k = max(validated_ks)
    resolved_backend = resolve_search_backend(backend)

    sampled = sample_rows(rows, sample, seed)
    sample_rows_sha256 = sha256_bytes(sampled.astype("<i8").tobytes())
    if (
        expected_sample_rows_sha256 is not None
        and sample_rows_sha256 != expected_sample_rows_sha256
    ):
        raise ValueError(
            "regenerated sample rows do not match the recorded audit provenance: "
            f"got {sample_rows_sha256}, expected {expected_sample_rows_sha256}"
        )
    queries_full = np.ascontiguousarray(corpus[sampled], dtype=np.float32)

    full_indices, _ = exact_cosine_knn(
        queries_full,
        corpus,
        3 * max_k,
        query_rows_in_corpus=sampled,
        memory_cap_bytes=memory_cap_bytes,
        backend=resolved_backend,
        progress=progress,
        phase=f"full {full_dim}",
    )
    prefix_indices, _ = exact_cosine_knn(
        prefix_transform(queries_full, validated_dim),
        corpus[:, :validated_dim],
        max_k,
        query_rows_in_corpus=sampled,
        memory_cap_bytes=memory_cap_bytes,
        backend=resolved_backend,
        progress=progress,
        phase=f"prefix {validated_dim}",
    )

    label_indices, label_scores = exact_cosine_knn(
        corpus[:, :validated_dim],
        corpus[:, :validated_dim],
        label_k,
        query_rows_in_corpus=np.arange(rows, dtype=np.int64),
        memory_cap_bytes=memory_cap_bytes,
        backend=resolved_backend,
        progress=progress,
        phase=f"label table {validated_dim}",
    )
    label_table_sha256 = sha256_bytes(
        label_indices.astype("<i8").tobytes() + label_scores.astype("<f4").tobytes()
    )

    # Stored k-NN distances are doubled cosine (1 - cos); FAISS returns cos.
    labels = clump_labels(
        label_indices,
        1.0 - label_scores.astype(np.float64),
        epsilon=epsilon,
    )
    shape = clump_shape(labels)
    progress.note(
        f"clumps at epsilon {epsilon}: {shape.multi_groups:,} multi-row groups, "
        f"{shape.grouped_rows:,} grouped rows, {shape.singleton_rows:,} singletons, "
        f"mean size {shape.mean_multi_group_size:.2f}"
    )

    scored = _ScoredQueries(
        plain={k: _plain_recall_per_query(prefix_indices, full_indices, k) for k in validated_ks},
        collapsed={
            k: collapsed_recall_per_query(prefix_indices, full_indices, labels, k)
            for k in validated_ks
        },
    )

    groups: dict[str, dict[str, ClumpColumnReport]] = {}
    if strata_path is not None:
        strata = StrataTable.from_parquet(strata_path)
        groups = _grouped(
            strata,
            sampled,
            scored,
            ks=validated_ks,
            min_group_size=min_group_size,
        )

    report = ClumpRecallReport(
        dim=validated_dim,
        ks=list(validated_ks),
        epsilon=epsilon,
        label_k=label_k,
        sample=sample,
        seed=seed,
        corpus_rows=rows,
        corpus_dim=full_dim,
        sample_rows_sha256=sample_rows_sha256,
        label_table_sha256=label_table_sha256,
        shape=shape,
        overall={k: _pair(scored.plain[k], scored.collapsed[k], None) for k in validated_ks},
        groups=groups,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = write_sidecar(out_dir / "clump-recall.json", report.model_dump(mode="json"))
    write_sidecar(
        out_dir / "clump-recall.meta.json",
        {
            "producer": PRODUCER,
            "seed": seed,
            "input_hashes": {"embeddings": matrix_details.content_sha256},
            "report_sha256": sha256_bytes(report_path.read_bytes()),
            "sample_rows_sha256": sample_rows_sha256,
            "label_table_sha256": label_table_sha256,
        },
    )
    return report
