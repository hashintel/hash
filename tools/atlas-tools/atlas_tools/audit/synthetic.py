"""Synthetic acceptance fixture for the prefix audit.

The corpus consists of well-separated cluster centroids whose coordinates are zero outside
a configurable ``signal_band`` (default dimensions 400..512) and Gaussian inside it, plus
small independent noise everywhere. With the default band:

- full-vector kNN respects clusters (signal dominates the noise);
- a prefix that covers the band (for example d=512) keeps the signal;
- a prefix that misses the band (for example d=256) sees mostly noise.

The construction is dimension-agnostic: nothing here or in the runner hardcodes a
particular embedding width.
"""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq


@dataclass(frozen=True)
class SyntheticCorpus:
    """Generated corpus with cluster structure.

    ``vectors`` is ``(n, dim)`` float32; ``cluster_labels`` is ``(n,)`` int64.
    """

    vectors: np.ndarray
    cluster_labels: np.ndarray


def make_synthetic(
    n: int,
    dim: int,
    *,
    n_clusters: int = 10,
    signal_band: tuple[int, int] = (400, 512),
    signal_scale: float = 1.0,
    noise_scale: float = 0.1,
    seed: int = 0,
) -> SyntheticCorpus:
    """Generate a corpus whose signal lives only in a dimension band.

    Cluster assignment is the balanced deterministic ``i % n_clusters``; all randomness
    flows through ``np.random.default_rng(seed)``. Raises ``ValueError`` when
    ``signal_band`` is out of range for ``dim`` or when ``n`` or ``n_clusters`` is not
    positive.
    """
    low, high = signal_band
    if not 0 <= low < high <= dim:
        raise ValueError(f"signal_band {signal_band} out of range for dim {dim}")

    if n_clusters <= 0 or n <= 0:
        raise ValueError("n and n_clusters must be positive")

    rng = np.random.default_rng(seed)
    centroids = np.zeros((n_clusters, dim), dtype=np.float64)
    centroids[:, low:high] = rng.standard_normal((n_clusters, high - low)) * signal_scale

    cluster_labels = np.arange(n, dtype=np.int64) % n_clusters
    vectors = centroids[cluster_labels] + rng.standard_normal((n, dim)) * noise_scale

    return SyntheticCorpus(
        vectors=vectors.astype(np.float32),
        cluster_labels=cluster_labels,
    )


def write_cluster_labels(path: PathLike, cluster_labels: np.ndarray) -> Path:
    """Write a strata parquet mapping every row to its cluster label.

    The columns are ``row`` (int64, 0..n-1) and ``cluster`` (string, ``"c<label>"``); the
    resulting table is directly consumable as ``--strata`` by ``audit run``.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    table = pa.table(
        {
            "row": pa.array(np.arange(len(cluster_labels), dtype=np.int64), type=pa.int64()),
            "cluster": pa.array([f"c{int(label)}" for label in cluster_labels]),
        }
    )
    pq.write_table(table, path)
    return path
