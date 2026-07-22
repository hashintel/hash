"""Metric unit tests.

Every metric can fail, and the reference implementations agree with sklearn where an sklearn
equivalent exists.
"""

import numpy as np
import pytest
from sklearn.manifold import trustworthiness as sk_trustworthiness

from atlas_tools.battery.metrics import (
    K,
    _trustworthiness_ranked,
    contraction_factor,
    edge_binding_ratio,
    knn_recall,
    layout_std,
    pendant_diffusion,
    silhouette_on_labels,
    trustworthiness_continuity,
)
from atlas_tools.common.knn import l2_normalize


def circle_blobs(
    n: int,
    n_blobs: int,
    seed: int,
    radius: float = 10.0,
    sigma: float = 0.5,
    extra_dims: int = 6,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.random.Generator]:
    """Build blobs on a circle in the first two dimensions plus near-zero extra dimensions.

    The extra dimensions are tiny, so cosine truth on the embedding matches the euclidean
    structure of the first two dimensions.
    """
    rng = np.random.default_rng(seed)
    labels = rng.integers(0, n_blobs, n)
    angles = 2 * np.pi * np.arange(n_blobs) / n_blobs
    centers = radius * np.stack([np.cos(angles), np.sin(angles)], axis=1)
    first_two = centers[labels] + sigma * rng.normal(size=(n, 2))
    embeddings = np.concatenate(
        [first_two, 0.01 * rng.normal(size=(n, extra_dims))], axis=1
    ).astype(np.float32)
    return embeddings, first_two, labels.astype(np.int64), rng


def test_trustworthiness_matches_sklearn_full_sample() -> None:
    rng = np.random.default_rng(0)
    embeddings = l2_normalize(rng.normal(size=(80, 5)).astype(np.float32)).astype(np.float64)
    xy = rng.normal(size=(80, 2))
    full = np.arange(80)
    mine = _trustworthiness_ranked(embeddings, xy, n_neighbors=7, sample_indices=full)
    assert mine == pytest.approx(sk_trustworthiness(embeddings, xy, n_neighbors=7), abs=1e-12)
    # continuity == trustworthiness with the two spaces swapped
    continuity = _trustworthiness_ranked(xy, embeddings, n_neighbors=7, sample_indices=full)
    assert continuity == pytest.approx(sk_trustworthiness(xy, embeddings, n_neighbors=7), abs=1e-12)


def test_trustworthiness_continuity_good_vs_shuffled() -> None:
    embeddings, first_two, _, rng = circle_blobs(400, 4, seed=0)
    trust, continuity = trustworthiness_continuity(embeddings, first_two, n_neighbors=10)
    assert trust > 0.9
    assert continuity > 0.9
    permutation = rng.permutation(400)
    shuffled_trust, shuffled_continuity = trustworthiness_continuity(
        embeddings, first_two[permutation], n_neighbors=10
    )
    assert abs(shuffled_trust - 0.5) < 0.1
    assert abs(shuffled_continuity - 0.5) < 0.1


def test_trustworthiness_sampled_is_deterministic_and_close_to_full() -> None:
    embeddings, first_two, _, _ = circle_blobs(400, 4, seed=1)
    a = trustworthiness_continuity(embeddings, first_two, n_neighbors=10, sample_size=100, seed=5)
    b = trustworthiness_continuity(embeddings, first_two, n_neighbors=10, sample_size=100, seed=5)
    assert a == b
    full = trustworthiness_continuity(embeddings, first_two, n_neighbors=10)
    assert a[0] == pytest.approx(full[0], abs=0.05)

    with pytest.raises(ValueError, match="n_neighbors"):
        trustworthiness_continuity(embeddings[:10], first_two[:10], n_neighbors=9)


def test_knn_recall_identity_layout_high_shuffled_chance() -> None:
    embeddings, first_two, _, rng = circle_blobs(400, 4, seed=0)
    good = knn_recall(first_two, embeddings, [K(15), K(30)])
    assert good[K(15)] > 0.35
    assert good[K(30)] >= good[K(15)] * 0.8
    permutation = rng.permutation(400)
    bad = knn_recall(first_two[permutation], embeddings, [K(15)])
    assert bad[K(15)] < 0.1
    assert good[K(15)] > 3 * bad[K(15)]


def test_silhouette_ordering_and_null_cases() -> None:
    _, first_two, labels, rng = circle_blobs(400, 4, seed=0)
    good = silhouette_on_labels(first_two, labels)
    permuted = silhouette_on_labels(first_two, labels[rng.permutation(400)])
    assert good is not None
    assert permuted is not None
    assert good > 0.8 > permuted
    # sampled variant is seeded/deterministic
    sampled_a = silhouette_on_labels(first_two, labels, sample_size=100, seed=3)
    sampled_b = silhouette_on_labels(first_two, labels, sample_size=100, seed=3)
    assert sampled_a == sampled_b
    assert silhouette_on_labels(first_two, np.full(400, -1, np.int64)) is None
    assert silhouette_on_labels(first_two, np.zeros(400, np.int64)) is None


def _star_layout(
    seed: int = 0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.random.Generator]:
    """Build 10 documents on a circle, each with 5 items placed at their document."""
    rng = np.random.default_rng(seed)
    n_docs, k = 10, 5
    angles = 2 * np.pi * np.arange(n_docs) / n_docs
    docs = 10.0 * np.stack([np.cos(angles), np.sin(angles)], axis=1)
    parent = np.repeat(np.arange(n_docs), k)
    items = docs[parent] + 0.05 * rng.normal(size=(n_docs * k, 2))
    xy = np.concatenate([docs, items])
    labels = np.concatenate([np.arange(n_docs), parent]).astype(np.int64)
    edges = np.stack([parent, n_docs + np.arange(n_docs * k)], axis=1).astype(np.int64)
    return xy, edges, labels, rng


def test_pendant_diffusion_small_at_partner_centroid_large_when_shuffled() -> None:
    xy, edges, labels, rng = _star_layout()
    good = pendant_diffusion(xy, edges, labels)
    shuffled = pendant_diffusion(xy[rng.permutation(len(xy))], edges, labels)
    assert good is not None
    assert shuffled is not None
    assert good < 0.1
    assert shuffled > 0.5
    assert good < shuffled
    # requires labels (documented simplification): None without them
    assert pendant_diffusion(xy, edges, np.full(len(xy), -1, np.int64)) is None
    assert pendant_diffusion(xy, np.zeros((0, 2), np.int64), labels) is None


def test_edge_binding_ratio_binds_near_edges_not_random_pairs() -> None:
    _, first_two, labels, rng = circle_blobs(400, 4, seed=0)
    order = np.lexsort((first_two[:, 1], labels))
    a, b = order[:-1], order[1:]
    same = labels[a] == labels[b]
    near_edges = np.stack([a[same], b[same]], axis=1).astype(np.int64)
    near = edge_binding_ratio(first_two, near_edges, seed=0)
    assert near is not None
    assert near < 0.7

    m = len(near_edges)
    random_pairs = np.stack([rng.integers(0, 400, m), rng.integers(0, 400, m)], axis=1).astype(
        np.int64
    )
    random_pairs = random_pairs[random_pairs[:, 0] != random_pairs[:, 1]]
    ratio = edge_binding_ratio(first_two, random_pairs, seed=0)
    assert ratio is not None
    assert 0.75 < ratio < 1.3
    assert edge_binding_ratio(first_two, np.zeros((0, 2), np.int64), seed=0) is None


def test_layout_std_and_contraction_factor() -> None:
    rng = np.random.default_rng(0)
    xy = rng.normal(size=(500, 2))
    assert layout_std(xy) == pytest.approx(np.sqrt(2), abs=0.15)
    assert contraction_factor(xy * 0.01, xy) == pytest.approx(0.01)
    assert contraction_factor(xy, np.zeros((5, 2))) is None
