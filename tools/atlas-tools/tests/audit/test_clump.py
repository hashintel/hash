import numpy as np
import pytest

from atlas_tools.audit.clump import (
    clump_labels,
    clump_shape,
    collapsed_recall_per_query,
)
from atlas_tools.audit.metrics import per_query_metrics


def test_epsilon_components_join_through_either_endpoint_and_chain() -> None:
    # Row 0 stores 1 within epsilon; row 2 stores 1 within epsilon only from
    # its own side; row 3 is near nobody. Components must chain 0-1-2.
    indices = np.array([[1], [3], [1], [0]], dtype=np.int64)
    distances = np.array([[0.001], [0.5], [0.002], [0.9]], dtype=np.float64)

    labels = clump_labels(indices, distances, epsilon=0.002)
    assert labels[0] == labels[1] == labels[2]
    assert labels[3] != labels[0]

    shape = clump_shape(labels)
    assert shape.multi_groups == 1
    assert shape.grouped_rows == 3
    assert shape.singleton_rows == 1
    assert shape.mean_multi_group_size == 3.0


def test_epsilon_threshold_is_inclusive_and_positive() -> None:
    indices = np.array([[1], [0]], dtype=np.int64)
    distances = np.array([[0.002], [0.002]], dtype=np.float64)
    labels = clump_labels(indices, distances, epsilon=0.002)
    assert labels[0] == labels[1]

    with pytest.raises(ValueError, match="epsilon"):
        clump_labels(indices, distances, epsilon=0.0)


def test_singleton_labels_reproduce_plain_recall_bit_for_bit() -> None:
    rng = np.random.default_rng(7)
    queries, max_k = 64, 15
    prefix = np.empty((queries, max_k), dtype=np.int64)
    full = np.empty((queries, 3 * max_k), dtype=np.int64)
    for query in range(queries):
        prefix[query] = rng.choice(1000, size=max_k, replace=False)
        full[query] = rng.choice(1000, size=3 * max_k, replace=False)

    identity = np.arange(1000, dtype=np.int64)
    for k in (5, 15):
        collapsed = collapsed_recall_per_query(prefix, full, identity, k)
        plain = per_query_metrics(prefix, full, k).recall
        np.testing.assert_array_equal(collapsed, plain)


def test_collapsed_never_reads_below_plain() -> None:
    rng = np.random.default_rng(11)
    queries, max_k, universe = 128, 15, 400
    prefix = np.empty((queries, max_k), dtype=np.int64)
    full = np.empty((queries, 3 * max_k), dtype=np.int64)
    for query in range(queries):
        prefix[query] = rng.choice(universe, size=max_k, replace=False)
        full[query] = rng.choice(universe, size=3 * max_k, replace=False)
    # Coarse random clumping: ~4 rows per label.
    labels = rng.integers(0, universe // 4, size=universe).astype(np.int64)

    for k in (5, 15):
        collapsed = collapsed_recall_per_query(prefix, full, labels, k)
        plain = per_query_metrics(prefix, full, k).recall
        assert (collapsed >= plain - 1e-12).all()


def test_multiset_intersection_counts_multiplicity_not_membership() -> None:
    # One clump {0, 1, 2}; retrieval shows two members, reference shows three:
    # exactly the two shown members are earned, not the whole clump.
    labels = np.array([9, 9, 9, 1, 2, 3], dtype=np.int64)
    prefix = np.array([[0, 1, 4]], dtype=np.int64)
    full = np.array([[0, 1, 2]], dtype=np.int64)
    assert collapsed_recall_per_query(prefix, full, labels, 3)[0] == pytest.approx(2 / 3)

    # Reference shows one member, retrieval shows three: one match only.
    prefix_many = np.array([[0, 1, 2]], dtype=np.int64)
    full_one = np.array([[0, 3, 4]], dtype=np.int64)
    assert collapsed_recall_per_query(prefix_many, full_one, labels, 3)[0] == pytest.approx(1 / 3)


def test_rejects_bad_shapes_and_k() -> None:
    indices = np.array([[1], [0]], dtype=np.int64)
    with pytest.raises(ValueError, match="shapes disagree"):
        clump_labels(indices, np.zeros((2, 2)), epsilon=0.1)

    labels = np.arange(2, dtype=np.int64)
    with pytest.raises(ValueError, match="k must be positive"):
        collapsed_recall_per_query(indices, indices, labels, 0)
    with pytest.raises(ValueError, match="columns"):
        collapsed_recall_per_query(indices, indices, labels, 2)
