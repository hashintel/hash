"""Layout-quality metrics, each a pure function of a layout and its ground truth.

Metric identity has one source of truth here: :class:`MetricName` names the fixed metrics and
:class:`KnnRecallMetric` expresses the per-k kNN-recall family. :class:`LayoutMetrics` carries
one run's values and is the only place that expands into the tidy ``results.parquet`` columns
(:meth:`LayoutMetrics.column_values` / :func:`metric_columns`).

Conventions:

- Embedding-space neighbor truth is exact cosine kNN
  (:func:`atlas_tools.common.knn.exact_cosine_knn`). Layout neighbors are exact 2-D euclidean
  kNN; suites stay small enough (n around 20k) that exact search is affordable.
- Cosine geometry is handled by L2-normalizing embeddings: euclidean distance on unit vectors
  is monotone in cosine distance (``||u - v||^2 = 2 - 2 cos``), so euclidean ranks equal cosine
  ranks.
- Metrics return ``None`` (meaning "not applicable") instead of guessing when their inputs are
  absent, for example silhouette or pendant diffusion without labels, or edge binding without
  edges. The gate layer treats a missing value on a gated shape as a failure (it fails closed).
"""

from collections.abc import Iterable, Sequence
from enum import StrEnum
from typing import Annotated, Final, Literal, Never, NewType

import numpy as np
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    PlainSerializer,
)
from sklearn.metrics import pairwise_distances, silhouette_score
from sklearn.neighbors import NearestNeighbors

from atlas_tools.common.knn import exact_cosine_knn, l2_normalize

K = NewType("K", int)
"""Neighborhood size of the kNN-recall metric family."""

KNN_RECALL_PREFIX: Final = "knn_recall_"

_MIN_SILHOUETTE_ROWS: Final = 3
"""Silhouette needs at least two classes, so at least three labeled rows."""

_MIN_SILHOUETTE_CLASSES: Final = 2
"""Silhouette is undefined with fewer than two label classes."""


class MetricName(StrEnum):
    """Names of the fixed layout-quality metrics.

    The per-k kNN-recall family is expressed separately as :class:`KnnRecallMetric`.
    """

    leaf_count = "leaf_count"
    total_persistence = "total_persistence"
    normalized_persistence = "normalized_persistence"
    trustworthiness = "trustworthiness"
    continuity = "continuity"
    silhouette = "silhouette"
    pendant_diffusion = "pendant_diffusion"
    edge_binding = "edge_binding"
    contraction_factor = "contraction_factor"


class KnnRecallMetric(BaseModel):
    """The kNN-recall metric at one neighborhood size (``knn_recall_{k}``)."""

    k: K

    model_config = ConfigDict(extra="forbid", frozen=True)


def knn_recall_column(k: int) -> str:
    """Return the ``results.parquet`` column name of the recall-at-k metric."""
    return f"{KNN_RECALL_PREFIX}{k}"


def metric_column(metric: MetricName | KnnRecallMetric) -> str:
    """Return the ``results.parquet`` column name of a metric identity."""
    if isinstance(metric, KnnRecallMetric):
        return knn_recall_column(metric.k)

    return metric.value


def _parse_metric_id(value: object) -> object:
    """Parse ``knn_recall_{k}`` column strings into the per-k family; pass others through."""
    if isinstance(value, str) and value.startswith(KNN_RECALL_PREFIX):
        return KnnRecallMetric(k=K(int(value.removeprefix(KNN_RECALL_PREFIX))))

    return value


type MetricId = Annotated[
    MetricName | KnnRecallMetric,
    BeforeValidator(_parse_metric_id),
    PlainSerializer(metric_column, return_type=str),
]
"""A metric identity as referenced by gate configs.

Validates from a ``results.parquet`` column string and serializes back to the same string.
"""


class LayoutMetrics(BaseModel):
    """Every metric value of one (engine, shape, seed, variant) run.

    ``None`` keeps its "not applicable" meaning (see the module docstring). Field order is the
    report and parquet column order; ``knn_recall`` expands to one ``knn_recall_{k}`` column per
    requested k.
    """

    leaf_count: float
    total_persistence: float
    normalized_persistence: float
    knn_recall: dict[K, float]
    trustworthiness: float
    continuity: float
    silhouette: float | None
    pendant_diffusion: float | None
    edge_binding: float | None
    contraction_factor: float | None

    model_config = ConfigDict(extra="forbid")

    def column_values(self) -> dict[str, float | None]:
        """Return the values keyed by ``results.parquet`` column, the single typed-to-tidy hop."""
        values: dict[str, float | None] = {}

        for name in type(self).model_fields:
            if name == "knn_recall":
                for k, recall in self.knn_recall.items():
                    values[knn_recall_column(k)] = recall
            else:
                values[name] = getattr(self, name)

        return values


def metric_columns(knn_ks: Iterable[K]) -> list[str]:
    """Return the metric column order, derived from :class:`LayoutMetrics` (no hand list)."""
    columns: list[str] = []

    for name in LayoutMetrics.model_fields:
        if name == "knn_recall":
            columns.extend(knn_recall_column(k) for k in knn_ks)
        else:
            columns.append(name)

    return columns


# One source of truth: the fixed-metric enum must mirror LayoutMetrics' scalar fields exactly
# (knn_recall expands per-k at the DataFrame boundary).
if [member.value for member in MetricName] != [
    name for name in LayoutMetrics.model_fields if name != "knn_recall"
]:
    raise RuntimeError("MetricName does not mirror the scalar fields of LayoutMetrics")


def layout_std(xy: np.ndarray) -> float:
    """Compute the RMS distance from the layout centroid: sqrt(var(x) + var(y)).

    An empty layout yields 0.0.
    """
    xy = np.asarray(xy, dtype=np.float64)
    if len(xy) == 0:
        return 0.0

    centered = xy - xy.mean(axis=0)
    return np.sqrt((centered**2).sum(axis=1).mean())


def layout_knn_indices(xy: np.ndarray, k: int) -> np.ndarray:
    """Compute exact euclidean kNN indices in layout space, excluding self.

    Raises :class:`ValueError` when ``k >= n``.
    """
    xy = np.asarray(xy, dtype=np.float64)
    n = len(xy)

    if k >= n:
        raise ValueError(f"k={k} must be < n={n}")

    nearest = NearestNeighbors(n_neighbors=k + 1).fit(xy)
    neighbor_indices = nearest.kneighbors(xy, return_distance=False)
    out = np.empty((n, k), dtype=np.int64)

    for i in range(n):
        row = neighbor_indices[i]
        row = row[row != i]  # drop self; with duplicate points self may be absent
        out[i] = row[:k]

    return out


def knn_recall(xy: np.ndarray, embeddings: np.ndarray, ks: Sequence[K]) -> dict[K, float]:
    """Compute recall at k: the mean overlap fraction of layout kNN with cosine-truth kNN.

    For each requested k, the score averages ``|layout kNN of i intersected with truth kNN of
    i| / k`` over all nodes i. Values lie in [0, 1]; higher is better, and a layout uncorrelated
    with the embeddings scores near chance (k / n). Raises :class:`ValueError` when
    ``max(ks) >= n``.
    """
    ordered = sorted(ks)
    kmax = ordered[-1]
    n = len(xy)
    embedding = np.ascontiguousarray(embeddings, dtype=np.float32)

    truth_indices, _ = exact_cosine_knn(
        embedding, embedding, kmax, query_rows_in_corpus=np.arange(n, dtype=np.int64)
    )

    layout_indices = layout_knn_indices(xy, kmax)
    out: dict[K, float] = {}

    for k in ordered:
        hits = 0

        for i in range(n):
            hits += np.intersect1d(truth_indices[i, :k], layout_indices[i, :k]).size

        out[k] = hits / (n * k)

    return out


def _trustworthiness_ranked(
    original: np.ndarray,
    embedded: np.ndarray,
    *,
    n_neighbors: int,
    sample_indices: np.ndarray,
) -> float:
    """Compute trustworthiness of ``embedded`` against ``original`` over sampled queries.

    T = 1 - 2 / (q * k * (2n - 3k - 1)) * penalty, where the penalty sums ``rank(i, j) - k``
    over the sampled queries i and those embedded k-nearest neighbors j of i that are not among
    i's k nearest in the original space; ``rank(i, j)`` is j's 1-based rank by original-space
    distance from i, self excluded. With ``sample_indices == arange(n)`` this equals
    ``sklearn.manifold.trustworthiness`` exactly (pinned by a test); the sampled variant
    averages the same per-query penalty over q seeded queries against the full corpus, keeping
    memory at O(q * n).
    """
    n = original.shape[0]
    k = int(n_neighbors)
    q = len(sample_indices)

    if not 0 < k < n / 2:
        raise ValueError(f"n_neighbors={k} must satisfy 0 < k < n/2 (n={n})")

    rows = np.arange(q)
    distances_original = pairwise_distances(original[sample_indices], original)
    distances_embedding = pairwise_distances(embedded[sample_indices], embedded)

    distances_original[rows, sample_indices] = np.inf
    distances_embedding[rows, sample_indices] = np.inf

    order = np.argsort(distances_original, axis=1)
    ranks = np.empty((q, n), dtype=np.int64)
    ranks[rows[:, None], order] = np.arange(n)[None, :]  # 0-based, nearest=0

    embedded_neighbors = np.argsort(distances_embedding, axis=1)[:, :k]
    rank = ranks[rows[:, None], embedded_neighbors] + 1  # 1-based rank in original space

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
    """Compute (trustworthiness, continuity) of a layout against cosine embedding space.

    Trustworthiness penalizes layout neighbors that are not embedding neighbors, weighted by
    their embedding rank. Continuity is trustworthiness with the roles of the two spaces
    swapped: it penalizes embedding neighbors missing from the layout neighborhood, weighted by
    their layout rank. Both scores approach 1.0 for a faithful layout and land near 0.5 for a
    layout unrelated to the embeddings. Embeddings are L2-normalized so euclidean ranks equal
    cosine ranks (see the module docstring).

    ``sample_size`` (if smaller than n) selects a seeded query subset; ranks are still computed
    against the full corpus, so results are deterministic for a fixed seed. Raises
    :class:`ValueError` unless ``0 < n_neighbors < n/2``.
    """
    embedding = l2_normalize(np.asarray(embeddings, dtype=np.float32)).astype(np.float64)

    xy = np.asarray(xy, dtype=np.float64)
    n = len(embedding)

    if sample_size is not None and sample_size < n:
        sample_indices = np.sort(
            np.random.default_rng(seed).choice(n, size=int(sample_size), replace=False)
        )
    else:
        sample_indices = np.arange(n)

    trust = _trustworthiness_ranked(
        embedding, xy, n_neighbors=n_neighbors, sample_indices=sample_indices
    )
    continuity = _trustworthiness_ranked(
        xy, embedding, n_neighbors=n_neighbors, sample_indices=sample_indices
    )

    return trust, continuity


def silhouette_on_labels(
    xy: np.ndarray,
    labels: np.ndarray,
    *,
    sample_size: int | None = None,
    seed: int = 0,
) -> float | None:
    """Compute the silhouette of the layout under planted labels.

    Rows labeled -1 are excluded. Values lie in [-1, 1]; higher means labels form tighter,
    better-separated layout clusters. Returns ``None`` when labels are absent or degenerate:
    fewer than three labeled rows, fewer than two classes, or as many classes as labeled rows.
    When ``sample_size`` is smaller than the labeled row count, a seeded sample keeps the result
    deterministic.
    """
    labels = np.asarray(labels, dtype=np.int64)
    mask = labels >= 0

    if int(mask.sum()) < _MIN_SILHOUETTE_ROWS:
        return None

    x = np.asarray(xy, dtype=np.float64)[mask]
    y = labels[mask]

    n_classes = np.unique(y).size
    if n_classes < _MIN_SILHOUETTE_CLASSES or n_classes >= len(y):
        return None

    kwargs: dict[str, Never] | dict[Literal["sample_size", "random_state"], int] = {}
    if sample_size is not None and sample_size < len(y):
        kwargs = {"sample_size": int(sample_size), "random_state": int(seed)}

    return silhouette_score(x, y, **kwargs)


def pendant_diffusion(xy: np.ndarray, edges: np.ndarray, labels: np.ndarray) -> float | None:
    """Compute how far degree-1 nodes drift from their partner's cluster in the layout.

    The value is the median layout distance from each degree-1 (pendant) node to the centroid
    of all nodes carrying its partner's planted label, normalized by :func:`layout_std`. Lower
    is better: a layout that places pendants at their partner's cluster scores near zero, while
    a shuffled layout scores well above it. Returns ``None`` when labels are absent, no degree-1
    node exists, no pendant has a labeled partner, or the layout has zero spread. The metric
    deliberately does not substitute a kNN-cluster proxy when labels are missing; gates scope it
    to labeled shapes with genuine pendants such as ``bipartite_star``.
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
    first_endpoint, second_endpoint = edges[:, 0], edges[:, 1]

    pendant_first = pendant[first_endpoint]
    partner[first_endpoint[pendant_first]] = second_endpoint[pendant_first]

    pendant_second = pendant[second_endpoint]
    partner[second_endpoint[pendant_second]] = first_endpoint[pendant_second]

    pendant_ids = np.nonzero(pendant)[0]
    partner_labels = labels[partner[pendant_ids]]

    has_labeled_partner = partner_labels >= 0
    if not has_labeled_partner.any():
        return None

    pendant_ids = pendant_ids[has_labeled_partner]
    partner_labels = partner_labels[has_labeled_partner]

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


def edge_binding_ratio(xy: np.ndarray, edges: np.ndarray, *, seed: int = 0) -> float | None:
    """Compute how tightly relation edges bind their endpoints in the layout.

    The value is the median layout distance across relation edges divided by the median over a
    size-matched, seeded random node-pair baseline. Values below 1 mean edges bind (endpoints
    sit closer than random pairs); a value near 1 means edges carry no layout signal. Returns
    ``None`` without edges, with fewer than two nodes, or when the layout is degenerate enough
    that the random-pair median distance is zero.
    """
    edges = np.asarray(edges, dtype=np.int64).reshape(-1, 2)

    xy = np.asarray(xy, dtype=np.float64)

    n = len(xy)
    if len(edges) == 0 or n <= 1:
        return None

    edge_distances = np.linalg.norm(xy[edges[:, 0]] - xy[edges[:, 1]], axis=1)

    rng = np.random.default_rng(seed)

    m = len(edges)
    i = rng.integers(0, n, size=m)
    j = rng.integers(0, n, size=m)

    bad = i == j
    while bad.any():
        j[bad] = rng.integers(0, n, size=int(bad.sum()))
        bad = i == j

    random_distances = np.linalg.norm(xy[i] - xy[j], axis=1)

    random_median = np.median(random_distances)
    if random_median <= 0:
        return None

    return np.median(edge_distances) / random_median


def contraction_factor(xy: np.ndarray, baseline_xy: np.ndarray) -> float | None:
    """Compute the layout spread relative to a same-seed no-relation baseline layout.

    The value is ``layout_std(xy) / layout_std(baseline_xy)``; values well below 1 indicate the
    relation terms collapsed the layout. Returns ``None`` when the baseline has zero spread.
    """
    baseline = layout_std(baseline_xy)

    if baseline <= 0:
        return None

    return layout_std(xy) / baseline
