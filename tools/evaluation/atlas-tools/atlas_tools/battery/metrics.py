"""Layout-quality metrics (W3.2), each a pure function of layout + truth.

Conventions:

- Embedding-space neighbor truth is exact cosine kNN
  (:func:`atlas_tools.common.knn.exact_cosine_knn`). Layout neighbors are
  exact 2-D euclidean kNN (n <= ~20k in suites; exact is fine).
- Cosine geometry is handled by L2-normalizing embeddings: euclidean
  distance on unit vectors is monotone in cosine distance
  (``||u - v||^2 = 2 - 2 cos``), so euclidean ranks equal cosine ranks.
- Metrics return ``None`` ("not applicable") instead of guessing when their
  inputs are absent — e.g. silhouette/pendant diffusion without labels, or
  edge binding without edges. The gate layer treats a missing value on a
  gated shape as a failure (fail closed).
"""

from typing import Literal, Never

import numpy as np
from sklearn.metrics import pairwise_distances, silhouette_score
from sklearn.neighbors import NearestNeighbors

from atlas_tools.common.knn import exact_cosine_knn, l2_normalize


def layout_std(xy: np.ndarray) -> float:
    """RMS distance from the layout centroid: sqrt(var(x) + var(y))."""
    xy = np.asarray(xy, dtype=np.float64)
    if len(xy) == 0:
        return 0.0

    centered = xy - xy.mean(axis=0)
    return np.sqrt((centered**2).sum(axis=1).mean())


def layout_knn_indices(xy: np.ndarray, k: int) -> np.ndarray:
    """Exact euclidean kNN indices in layout space, self excluded."""
    xy = np.asarray(xy, dtype=np.float64)
    n = len(xy)

    if k >= n:
        raise ValueError(f"k={k} must be < n={n}")

    nn = NearestNeighbors(n_neighbors=k + 1).fit(xy)
    idx = nn.kneighbors(xy, return_distance=False)
    out = np.empty((n, k), dtype=np.int64)

    for i in range(n):
        row = idx[i]
        row = row[row != i]  # drop self; with duplicates self may be absent
        out[i] = row[:k]

    return out


def knn_recall(
    xy: np.ndarray, embeddings: np.ndarray, ks: list[int]
) -> dict[str, float]:
    """recall@k = mean fraction overlap of layout kNN vs cosine truth kNN."""
    ks = sorted(int(k) for k in ks)
    kmax = ks[-1]
    n = len(xy)
    embedding = np.ascontiguousarray(embeddings, dtype=np.float32)

    truth_idx, _ = exact_cosine_knn(
        embedding, embedding, kmax, query_rows_in_corpus=np.arange(n, dtype=np.int64)
    )

    lay_idx = layout_knn_indices(xy, kmax)
    out: dict[str, float] = {}

    for k in ks:
        hits = 0

        for i in range(n):
            hits += np.intersect1d(truth_idx[i, :k], lay_idx[i, :k]).size

        out[f"knn_recall_{k}"] = hits / (n * k)

    return out


def _trustworthiness_ranked(
    orig: np.ndarray,
    embedded: np.ndarray,
    *,
    n_neighbors: int,
    sample_idx: np.ndarray,
) -> float:
    """Trustworthiness of ``embedded`` w.r.t. ``orig`` over sampled queries.

    T = 1 - 2/(q*k*(2n - 3k - 1)) * sum_i sum_{j in NN_k^embedded(i) \\
    NN_k^orig(i)} (rank_orig(i, j) - k), with ranks 1-based over the corpus
    excluding self. With ``sample_idx == arange(n)`` this is exactly
    ``sklearn.manifold.trustworthiness`` (tested); the sampled variant
    averages the same per-query penalty over q seeded queries against the
    full corpus, keeping memory at O(q * n).
    """
    n = orig.shape[0]
    k = int(n_neighbors)
    q = len(sample_idx)

    if not 0 < k < n / 2:
        raise ValueError(f"n_neighbors={k} must satisfy 0 < k < n/2 (n={n})")

    rows = np.arange(q)
    distances_original = pairwise_distances(orig[sample_idx], orig)
    distances_embedding = pairwise_distances(embedded[sample_idx], embedded)

    distances_original[rows, sample_idx] = np.inf
    distances_embedding[rows, sample_idx] = np.inf

    order = np.argsort(distances_original, axis=1)
    ranks = np.empty((q, n), dtype=np.int64)
    ranks[rows[:, None], order] = np.arange(n)[None, :]  # 0-based, nearest=0

    nn_embeddings = np.argsort(distances_embedding, axis=1)[:, :k]
    rank = ranks[rows[:, None], nn_embeddings] + 1  # 1-based rank in orig space

    penalty = np.maximum(0, rank - k).sum()
    return 1.0 - 2.0 * penalty / (q * k * (2.0 * n - 3.0 * k - 1.0))


def trustworthiness_continuity(
    embeddings: np.ndarray,
    xy: np.ndarray,
    *,
    n_neighbors: int = 15,
    sample_size: int | None = None,
    seed: int = 0,
) -> tuple[float, float]:
    """(trustworthiness, continuity) of a layout vs cosine embedding space.

    Trustworthiness penalizes layout neighbors that are not embedding
    neighbors (weighted by their embedding rank). Continuity is
    *trustworthiness with the roles of the two spaces swapped*: it
    penalizes embedding neighbors missing from the layout neighborhood,
    weighted by their layout rank. Embeddings are L2-normalized so
    euclidean ranks equal cosine ranks (see module docstring).

    ``sample_size`` (if smaller than n) selects a seeded query subset;
    ranks are still computed against the full corpus.
    """
    embedding = l2_normalize(np.asarray(embeddings, dtype=np.float32)).astype(
        np.float64
    )

    xy = np.asarray(xy, dtype=np.float64)
    n = len(embedding)

    if sample_size is not None and sample_size < n:
        sample_idx = np.sort(
            np.random.default_rng(seed).choice(n, size=int(sample_size), replace=False)
        )
    else:
        sample_idx = np.arange(n)

    trust = _trustworthiness_ranked(
        embedding, xy, n_neighbors=n_neighbors, sample_idx=sample_idx
    )
    continuity = _trustworthiness_ranked(
        xy, embedding, n_neighbors=n_neighbors, sample_idx=sample_idx
    )

    return trust, continuity


def silhouette_on_labels(
    xy: np.ndarray,
    labels: np.ndarray,
    *,
    sample_size: int | None = None,
    seed: int = 0,
) -> float | None:
    """Silhouette of the layout under planted labels; None when labels are
    absent or degenerate (<2 classes). Rows with label -1 are excluded."""
    labels = np.asarray(labels, dtype=np.int64)
    mask = labels >= 0

    if int(mask.sum()) < 3:
        return None

    x = np.asarray(xy, dtype=np.float64)[mask]
    y = labels[mask]

    n_classes = np.unique(y).size
    if n_classes < 2 or n_classes >= len(y):
        return None

    kwargs: dict[str, Never] | dict[Literal["sample_size", "random_state"], int] = {}
    if sample_size is not None and sample_size < len(y):
        kwargs = {"sample_size": int(sample_size), "random_state": int(seed)}

    return silhouette_score(x, y, **kwargs)


def pendant_diffusion(
    xy: np.ndarray, edges: np.ndarray, labels: np.ndarray
) -> float | None:
    """Median layout distance of degree-1 nodes to their partner's cluster
    centroid, normalized by :func:`layout_std`.

    The partner's cluster is defined by planted labels: the centroid of all
    nodes carrying the partner's label. When labels are absent (or no
    degree-1 nodes exist) the metric is ``None`` — we deliberately do not
    substitute a kNN-cluster proxy; gates scope this metric to labeled
    shapes with genuine pendants (e.g. ``bipartite_star``).
    """
    edges = np.asarray(edges, dtype=np.int64).reshape(-1, 2)
    labels = np.asarray(labels, dtype=np.int64)

    xy = np.asarray(xy, dtype=np.float64)

    n = len(xy)
    if len(edges) == 0 or not (labels >= 0).any():
        return None

    degree = np.bincount(edges.ravel(), minlength=n)

    pendant = degree == 1
    if not pendant.any():
        return None

    partner = np.full(n, -1, dtype=np.int64)
    e0, e1 = edges[:, 0], edges[:, 1]

    m0 = pendant[e0]
    partner[e0[m0]] = e1[m0]

    m1 = pendant[e1]
    partner[e1[m1]] = e0[m1]

    pendant_ids = np.nonzero(pendant)[0]
    partner_labels = labels[partner[pendant_ids]]

    ok = partner_labels >= 0
    if not ok.any():
        return None

    pendant_ids = pendant_ids[ok]
    partner_labels = partner_labels[ok]

    n_labels = int(labels.max()) + 1
    centroids = np.zeros((n_labels, 2))
    counts = np.zeros(n_labels)
    labeled = labels >= 0

    np.add.at(centroids, labels[labeled], xy[labeled])
    np.add.at(counts, labels[labeled], 1)
    centroids /= np.maximum(counts, 1)[:, None]

    distances = np.linalg.norm(xy[pendant_ids] - centroids[partner_labels], axis=1)
    std = layout_std(xy)

    if std <= 0:
        return None

    return np.median(distances) / std


def edge_binding_ratio(
    xy: np.ndarray, edges: np.ndarray, *, seed: int = 0
) -> float | None:
    """Median layout distance across relation edges divided by the median
    over a size-matched seeded random node-pair baseline. < 1 means edges
    bind. ``None`` without edges or on a fully degenerate layout."""
    edges = np.asarray(edges, dtype=np.int64).reshape(-1, 2)

    xy = np.asarray(xy, dtype=np.float64)

    n = len(xy)
    if len(edges) == 0 or n < 2:
        return None

    d_edge = np.linalg.norm(xy[edges[:, 0]] - xy[edges[:, 1]], axis=1)

    rng = np.random.default_rng(seed)

    m = len(edges)
    i = rng.integers(0, n, size=m)
    j = rng.integers(0, n, size=m)

    bad = i == j
    while bad.any():
        j[bad] = rng.integers(0, n, size=int(bad.sum()))
        bad = i == j

    d_rand = np.linalg.norm(xy[i] - xy[j], axis=1)

    median_rand = np.median(d_rand)
    if median_rand <= 0:
        return None

    return np.median(d_edge) / median_rand


def contraction_factor(xy: np.ndarray, baseline_xy: np.ndarray) -> float | None:
    """Layout std relative to a same-seed no-relation baseline layout."""
    baseline = layout_std(baseline_xy)

    if baseline <= 0:
        return None

    return layout_std(xy) / baseline
