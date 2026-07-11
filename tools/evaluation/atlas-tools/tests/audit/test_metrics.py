"""Metric unit tests on tiny hand-built cases with hand-computed values."""

import numpy as np
import pytest
from atlas_tools.audit.metrics import per_query_metrics, rank_in_reference


class TestRankInReference:
    def test_ranks_and_absent(self):
        candidates = np.array([[3, 7, 5]])
        reference = np.array([[5, 9, 3, 1]])
        ranks = rank_in_reference(candidates, reference, absent_rank=99)
        np.testing.assert_array_equal(ranks, [[2, 99, 0]])

    def test_chunking_matches_unchunked(self):
        rng = np.random.default_rng(0)
        candidates = rng.integers(0, 50, size=(10, 4))
        reference = rng.integers(0, 50, size=(10, 12))
        a = rank_in_reference(candidates, reference, absent_rank=12, chunk=3)
        b = rank_in_reference(candidates, reference, absent_rank=12, chunk=1000)
        np.testing.assert_array_equal(a, b)


class TestRecall:
    def test_recall_by_hand(self):
        # k=3. Query 0: prefix {1,2,3} vs full top-3 {1,4,3} -> overlap 2 -> 2/3.
        # Query 1: prefix {5,6,7} vs full top-3 {7,6,5} -> overlap 3 -> 1.
        prefix_idx = np.array([[1, 2, 3], [5, 6, 7]])
        full_idx = np.array(
            [
                [1, 4, 3, 10, 11, 12, 13, 14, 15],
                [7, 6, 5, 20, 21, 22, 23, 24, 25],
            ]
        )
        m = per_query_metrics(prefix_idx, full_idx, 3)
        assert m.recall[0] == pytest.approx(2 / 3, abs=1e-12)
        assert m.recall[1] == pytest.approx(1.0, abs=1e-12)


class TestIntrusionRate:
    def test_known_intruder(self):
        # k=1, so the reference is the full top-3. Query 0's prefix neighbor 9
        # is nowhere in the full top-3: a known intruder. Query 1's neighbor 5
        # is the full top-1: no intrusion.
        prefix_idx = np.array([[9], [5]])
        full_idx = np.array([[5, 6, 7], [5, 6, 7]])
        m = per_query_metrics(prefix_idx, full_idx, 1)
        assert m.intrusion_rate[0] == pytest.approx(1.0, abs=1e-12)
        assert m.intrusion_rate[1] == pytest.approx(0.0, abs=1e-12)

    def test_neighbor_outside_topk_but_inside_top3k_is_not_intrusion(self):
        # k=1: prefix neighbor is at full rank 2 (< 3k=3): recall misses it
        # but it is NOT an intruder.
        prefix_idx = np.array([[7]])
        full_idx = np.array([[5, 6, 7]])
        m = per_query_metrics(prefix_idx, full_idx, 1)
        assert m.recall[0] == pytest.approx(0.0, abs=1e-12)
        assert m.intrusion_rate[0] == pytest.approx(0.0, abs=1e-12)


class TestMeanRankDisplacement:
    def test_crafted_permutation_exact_value(self):
        # k=3, cap=9. Full list [10,11,12,...]; prefix is the permutation
        # [12,10,11] with full ranks [2,0,1] and prefix ranks [0,1,2]:
        # displacements max(2-0,0)=2, max(0-1,0)=0, max(1-2,0)=0 -> mean 2/3.
        prefix_idx = np.array([[12, 10, 11]])
        full_idx = np.array([[10, 11, 12, 13, 14, 15, 16, 17, 18]])
        m = per_query_metrics(prefix_idx, full_idx, 3)
        assert m.mean_rank_displacement[0] == pytest.approx(2 / 3, abs=1e-12)

    def test_intruder_gets_the_cap(self):
        # k=1, cap=3: absent neighbor gets rank_full=3, rank_prefix=0 -> 3.0.
        prefix_idx = np.array([[9]])
        full_idx = np.array([[5, 6, 7]])
        m = per_query_metrics(prefix_idx, full_idx, 1)
        assert m.mean_rank_displacement[0] == pytest.approx(3.0, abs=1e-12)

    def test_identity_permutation_is_zero(self):
        prefix_idx = np.array([[5, 6, 7]])
        full_idx = np.array([[5, 6, 7, 8, 9, 10, 11, 12, 13]])
        m = per_query_metrics(prefix_idx, full_idx, 3)
        assert m.mean_rank_displacement[0] == pytest.approx(0.0, abs=1e-12)
        assert m.recall[0] == pytest.approx(1.0, abs=1e-12)
        assert m.intrusion_rate[0] == pytest.approx(0.0, abs=1e-12)
