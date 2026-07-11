"""Metric unit tests (W3.2): every metric can fail, and the reference
implementations agree with sklearn where an sklearn equivalent exists."""

import numpy as np
import pytest
from atlas_tools.battery.metrics import (
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
from sklearn.manifold import trustworthiness as sk_trustworthiness


def circle_blobs(n, n_blobs, seed, radius=10.0, sigma=0.5, extra_dims=6):
    """Blobs on a circle in the first two dims + tiny extra dims, so cosine
    truth on the embedding matches euclidean structure of the first two."""
    rng = np.random.default_rng(seed)
    labels = rng.integers(0, n_blobs, n)
    angles = 2 * np.pi * np.arange(n_blobs) / n_blobs
    centers = radius * np.stack([np.cos(angles), np.sin(angles)], axis=1)
    first2 = centers[labels] + sigma * rng.normal(size=(n, 2))
    emb = np.concatenate(
        [first2, 0.01 * rng.normal(size=(n, extra_dims))], axis=1
    ).astype(np.float32)
    return emb, first2, labels.astype(np.int64), rng


def test_trustworthiness_matches_sklearn_full_sample():
    rng = np.random.default_rng(0)
    emb = l2_normalize(rng.normal(size=(80, 5)).astype(np.float32)).astype(np.float64)
    xy = rng.normal(size=(80, 2))
    full = np.arange(80)
    mine = _trustworthiness_ranked(emb, xy, n_neighbors=7, sample_idx=full)
    assert mine == pytest.approx(sk_trustworthiness(emb, xy, n_neighbors=7), abs=1e-12)
    # continuity == trustworthiness with the two spaces swapped
    cont = _trustworthiness_ranked(xy, emb, n_neighbors=7, sample_idx=full)
    assert cont == pytest.approx(sk_trustworthiness(xy, emb, n_neighbors=7), abs=1e-12)


def test_trustworthiness_continuity_good_vs_shuffled():
    emb, first2, _, rng = circle_blobs(400, 4, seed=0)
    trust, cont = trustworthiness_continuity(emb, first2, n_neighbors=10)
    assert trust > 0.9 and cont > 0.9
    perm = rng.permutation(400)
    trust_s, cont_s = trustworthiness_continuity(emb, first2[perm], n_neighbors=10)
    assert abs(trust_s - 0.5) < 0.1 and abs(cont_s - 0.5) < 0.1


def test_trustworthiness_sampled_is_deterministic_and_close_to_full():
    emb, first2, _, _ = circle_blobs(400, 4, seed=1)
    a = trustworthiness_continuity(emb, first2, n_neighbors=10, sample_size=100, seed=5)
    b = trustworthiness_continuity(emb, first2, n_neighbors=10, sample_size=100, seed=5)
    assert a == b
    full = trustworthiness_continuity(emb, first2, n_neighbors=10)
    assert a[0] == pytest.approx(full[0], abs=0.05)

    with pytest.raises(ValueError, match="n_neighbors"):
        trustworthiness_continuity(emb[:10], first2[:10], n_neighbors=9)


def test_knn_recall_identity_layout_high_shuffled_chance():
    emb, first2, _, rng = circle_blobs(400, 4, seed=0)
    good = knn_recall(first2, emb, [15, 30])
    assert good["knn_recall_15"] > 0.35
    assert good["knn_recall_30"] >= good["knn_recall_15"] * 0.8
    perm = rng.permutation(400)
    bad = knn_recall(first2[perm], emb, [15])
    assert bad["knn_recall_15"] < 0.1
    assert good["knn_recall_15"] > 3 * bad["knn_recall_15"]


def test_silhouette_ordering_and_null_cases():
    _, first2, labels, rng = circle_blobs(400, 4, seed=0)
    good = silhouette_on_labels(first2, labels)
    permuted = silhouette_on_labels(first2, labels[rng.permutation(400)])
    assert good is not None and permuted is not None
    assert good > 0.8 > permuted
    # sampled variant is seeded/deterministic
    s1 = silhouette_on_labels(first2, labels, sample_size=100, seed=3)
    s2 = silhouette_on_labels(first2, labels, sample_size=100, seed=3)
    assert s1 == s2
    assert silhouette_on_labels(first2, np.full(400, -1, np.int64)) is None
    assert silhouette_on_labels(first2, np.zeros(400, np.int64)) is None


def _star_layout(seed=0):
    """10 docs on a circle, 5 items each placed at their doc."""
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


def test_pendant_diffusion_small_at_partner_centroid_large_when_shuffled():
    xy, edges, labels, rng = _star_layout()
    good = pendant_diffusion(xy, edges, labels)
    shuffled = pendant_diffusion(xy[rng.permutation(len(xy))], edges, labels)
    assert good is not None and shuffled is not None
    assert good < 0.1
    assert shuffled > 0.5
    assert good < shuffled
    # requires labels (documented simplification): None without them
    assert pendant_diffusion(xy, edges, np.full(len(xy), -1, np.int64)) is None
    assert pendant_diffusion(xy, np.zeros((0, 2), np.int64), labels) is None


def test_edge_binding_ratio_binds_near_edges_not_random_pairs():
    _, first2, labels, rng = circle_blobs(400, 4, seed=0)
    order = np.lexsort((first2[:, 1], labels))
    a, b = order[:-1], order[1:]
    same = labels[a] == labels[b]
    near_edges = np.stack([a[same], b[same]], axis=1).astype(np.int64)
    near = edge_binding_ratio(first2, near_edges, seed=0)
    assert near is not None and near < 0.7

    m = len(near_edges)
    rand = np.stack([rng.integers(0, 400, m), rng.integers(0, 400, m)], axis=1).astype(
        np.int64
    )
    rand = rand[rand[:, 0] != rand[:, 1]]
    ratio = edge_binding_ratio(first2, rand, seed=0)
    assert ratio is not None and 0.75 < ratio < 1.3
    assert edge_binding_ratio(first2, np.zeros((0, 2), np.int64), seed=0) is None


def test_layout_std_and_contraction_factor():
    rng = np.random.default_rng(0)
    xy = rng.normal(size=(500, 2))
    assert layout_std(xy) == pytest.approx(np.sqrt(2), abs=0.15)
    assert contraction_factor(xy * 0.01, xy) == pytest.approx(0.01)
    assert contraction_factor(xy, np.zeros((5, 2))) is None
