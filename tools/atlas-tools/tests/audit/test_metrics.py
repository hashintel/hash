"""Metric unit tests on tiny hand-built cases with hand-computed values."""

import numpy as np
import pytest

from atlas_tools.audit.metrics import per_query_metrics, rank_in_reference


class TestRankInReference:
    def test_ranks_and_absent(self) -> None:
        candidates = np.array([[3, 7, 5]])
        reference = np.array([[5, 9, 3, 1]])
        ranks = rank_in_reference(candidates, reference, absent_rank=99)
        np.testing.assert_array_equal(ranks, [[2, 99, 0]])

    def test_chunking_matches_unchunked(self) -> None:
        rng = np.random.default_rng(0)
        candidates = rng.integers(0, 50, size=(10, 4))
        reference = rng.integers(0, 50, size=(10, 12))
        chunked = rank_in_reference(candidates, reference, absent_rank=12, chunk=3)
        unchunked = rank_in_reference(candidates, reference, absent_rank=12, chunk=1000)
        np.testing.assert_array_equal(chunked, unchunked)


class TestRecall:
    def test_recall_by_hand(self) -> None:
        # k=3. Query 0: prefix {1,2,3} vs full top-3 {1,4,3} overlaps in 2, so recall
        # is 2/3. Query 1: prefix {5,6,7} vs full top-3 {7,6,5} overlaps in 3: recall 1.
        prefix_indices = np.array([[1, 2, 3], [5, 6, 7]])
        full_indices = np.array(
            [
                [1, 4, 3, 10, 11, 12, 13, 14, 15],
                [7, 6, 5, 20, 21, 22, 23, 24, 25],
            ]
        )
        metrics = per_query_metrics(prefix_indices, full_indices, 3)
        assert metrics.recall[0] == pytest.approx(2 / 3, abs=1e-12)
        assert metrics.recall[1] == pytest.approx(1.0, abs=1e-12)


class TestIntrusionRate:
    def test_known_intruder(self) -> None:
        # k=1, so the reference is the full top-3. Query 0's prefix neighbor 9 is
        # nowhere in the full top-3: a known intruder. Query 1's neighbor 5 is the
        # full top-1: no intrusion.
        prefix_indices = np.array([[9], [5]])
        full_indices = np.array([[5, 6, 7], [5, 6, 7]])
        metrics = per_query_metrics(prefix_indices, full_indices, 1)
        assert metrics.intrusion_rate[0] == pytest.approx(1.0, abs=1e-12)
        assert metrics.intrusion_rate[1] == pytest.approx(0.0, abs=1e-12)

    def test_neighbor_outside_topk_but_inside_top3k_is_not_intrusion(self) -> None:
        # k=1: the prefix neighbor sits at full rank 2 (below 3k=3), so recall misses
        # it, yet it does not count as an intruder.
        prefix_indices = np.array([[7]])
        full_indices = np.array([[5, 6, 7]])
        metrics = per_query_metrics(prefix_indices, full_indices, 1)
        assert metrics.recall[0] == pytest.approx(0.0, abs=1e-12)
        assert metrics.intrusion_rate[0] == pytest.approx(0.0, abs=1e-12)


class TestMeanRankDisplacement:
    def test_crafted_permutation_exact_value(self) -> None:
        # k=3, cap=9. Full list [10,11,12,...]; prefix is the permutation [12,10,11]
        # with full ranks [2,0,1] and prefix ranks [0,1,2]. The displacements are
        # max(2-0,0)=2, max(0-1,0)=0, max(1-2,0)=0, so the mean is 2/3.
        prefix_indices = np.array([[12, 10, 11]])
        full_indices = np.array([[10, 11, 12, 13, 14, 15, 16, 17, 18]])
        metrics = per_query_metrics(prefix_indices, full_indices, 3)
        assert metrics.mean_rank_displacement[0] == pytest.approx(2 / 3, abs=1e-12)

    def test_intruder_gets_the_cap(self) -> None:
        # k=1, cap=3: the absent neighbor gets rank_full=3 and rank_prefix=0, so its
        # displacement is 3.0.
        prefix_indices = np.array([[9]])
        full_indices = np.array([[5, 6, 7]])
        metrics = per_query_metrics(prefix_indices, full_indices, 1)
        assert metrics.mean_rank_displacement[0] == pytest.approx(3.0, abs=1e-12)

    def test_identity_permutation_is_zero(self) -> None:
        prefix_indices = np.array([[5, 6, 7]])
        full_indices = np.array([[5, 6, 7, 8, 9, 10, 11, 12, 13]])
        metrics = per_query_metrics(prefix_indices, full_indices, 3)
        assert metrics.mean_rank_displacement[0] == pytest.approx(0.0, abs=1e-12)
        assert metrics.recall[0] == pytest.approx(1.0, abs=1e-12)
        assert metrics.intrusion_rate[0] == pytest.approx(0.0, abs=1e-12)
