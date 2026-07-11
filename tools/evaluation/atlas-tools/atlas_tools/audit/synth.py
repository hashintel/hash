"""Synthetic acceptance fixture for the prefix audit.

Construction (per PRD W1 acceptance): well-separated cluster centroids whose
coordinates are zero outside a configurable ``signal_band`` (default dims
400..512) and Gaussian inside it, plus small iid noise everywhere. With the
default band:

- full-vector kNN respects clusters (signal dominates the noise);
- a prefix that covers the band (e.g. d=512) keeps the signal;
- a prefix that misses the band (e.g. d=256) sees mostly noise.

The tool is dim-agnostic: nothing here or in the runner hardcodes 3072.
"""

from __future__ import annotations

import numpy as np


def make_synthetic(
    n: int,
    dim: int,
    *,
    n_clusters: int = 10,
    signal_band: tuple[int, int] = (400, 512),
    signal_scale: float = 1.0,
    noise_scale: float = 0.1,
    seed: int = 0,
) -> tuple[np.ndarray, np.ndarray]:
    """Generate ``(vectors, cluster_labels)`` with signal only in a dim band.

    ``vectors`` is ``(n, dim)`` float32; ``cluster_labels`` is ``(n,)`` int64
    with a balanced deterministic assignment ``i % n_clusters``.
    """
    lo, hi = signal_band
    if not 0 <= lo < hi <= dim:
        raise ValueError(f"signal_band {signal_band} out of range for dim {dim}")
    if n_clusters <= 0 or n <= 0:
        raise ValueError("n and n_clusters must be positive")
    rng = np.random.default_rng(seed)
    centroids = np.zeros((n_clusters, dim), dtype=np.float64)
    centroids[:, lo:hi] = rng.standard_normal((n_clusters, hi - lo)) * signal_scale
    labels = np.arange(n, dtype=np.int64) % n_clusters
    x = centroids[labels] + rng.standard_normal((n, dim)) * noise_scale
    return x.astype(np.float32), labels
