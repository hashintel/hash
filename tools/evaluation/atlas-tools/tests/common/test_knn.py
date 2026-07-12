import numpy as np
import pytest

from atlas_tools.common.knn import exact_cosine_knn, l2_normalize, prefix_transform


class TestPrefixTransform:
    def test_truncate_then_normalize_vector(self) -> None:
        # Known vector: the prefix (3, 4) has norm 5 after truncation, even though the
        # full vector has a large third component.
        x = np.array([[3.0, 4.0, 100.0]], dtype=np.float32)
        out = prefix_transform(x, 2)
        np.testing.assert_allclose(out, [[0.6, 0.8]], atol=1e-6)

    def test_normalization_happens_after_truncation(self) -> None:
        # Normalizing first and then truncating would leave a non-unit vector.
        x = np.array([[1.0, 0.0, 10.0]], dtype=np.float32)
        out = prefix_transform(x, 2)
        np.testing.assert_allclose(np.linalg.norm(out, axis=1), [1.0], atol=1e-6)
        np.testing.assert_allclose(out, [[1.0, 0.0]], atol=1e-6)

    def test_zero_norm_guard(self) -> None:
        x = np.array([[0.0, 0.0, 5.0]], dtype=np.float32)
        out = prefix_transform(x, 2)
        np.testing.assert_array_equal(out, [[0.0, 0.0]])

    def test_non_finite_rejected(self) -> None:
        x = np.array([[np.nan, 1.0]], dtype=np.float32)
        with pytest.raises(ValueError, match="non-finite"):
            prefix_transform(x, 1)

    def test_dim_bounds(self) -> None:
        x = np.zeros((1, 4), dtype=np.float32)
        with pytest.raises(ValueError, match="out of range"):
            prefix_transform(x, 0)
        with pytest.raises(ValueError, match="out of range"):
            prefix_transform(x, 5)


class TestL2Normalize:
    def test_unit_rows(self) -> None:
        rng = np.random.default_rng(1)
        x = rng.standard_normal((50, 8)).astype(np.float32)
        out = l2_normalize(x)
        np.testing.assert_allclose(np.linalg.norm(out, axis=1), np.ones(50), atol=1e-5)


class TestExactCosineKnn:
    def _brute_force(
        self,
        queries: np.ndarray,
        corpus: np.ndarray,
        k: int,
        exclude: np.ndarray | None = None,
    ) -> np.ndarray:
        queries_normalized = l2_normalize(queries)
        corpus_normalized = l2_normalize(corpus)
        # Spurious FP warnings from Accelerate BLAS on macOS; inputs are finite.
        with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
            scores = queries_normalized @ corpus_normalized.T
        if exclude is not None:
            scores[np.arange(len(exclude)), exclude] = -np.inf
        # Sort by (-score, index) for deterministic ties.
        return np.lexsort(
            (np.broadcast_to(np.arange(corpus.shape[0]), scores.shape), -scores),
            axis=1,
        )[:, :k]

    def test_matches_brute_force_across_blocks(self) -> None:
        rng = np.random.default_rng(2)
        corpus = rng.standard_normal((500, 16)).astype(np.float32)
        queries = corpus[:40]
        # Tiny memory cap forces many blocks: b = cap // (4 * (q + d)).
        indices, scores = exact_cosine_knn(queries, corpus, 10, memory_cap_bytes=4 * (40 + 16) * 7)
        expected = self._brute_force(queries, corpus, 10)
        np.testing.assert_array_equal(indices, expected)
        assert np.all(np.diff(scores, axis=1) <= 1e-6)

    def test_self_exclusion(self) -> None:
        rng = np.random.default_rng(3)
        corpus = rng.standard_normal((100, 8)).astype(np.float32)
        queries = corpus[10:20]
        rows = np.arange(10, 20, dtype=np.int64)
        indices, _ = exact_cosine_knn(queries, corpus, 5, query_rows_in_corpus=rows)
        assert not np.any(indices == rows[:, None])
        expected = self._brute_force(queries, corpus, 5, exclude=rows)
        np.testing.assert_array_equal(indices, expected)

    def test_deterministic_tie_break(self) -> None:
        # Duplicate corpus rows: identical scores must resolve to the lower index.
        corpus = np.tile(np.array([[1.0, 0.0]], dtype=np.float32), (6, 1))
        queries = np.array([[1.0, 0.0]], dtype=np.float32)
        indices, _ = exact_cosine_knn(queries, corpus, 3)
        np.testing.assert_array_equal(indices, [[0, 1, 2]])

    def test_block_size_independence(self) -> None:
        rng = np.random.default_rng(4)
        corpus = rng.standard_normal((300, 12)).astype(np.float32)
        queries = rng.standard_normal((20, 12)).astype(np.float32)
        indices_small, _ = exact_cosine_knn(
            queries, corpus, 15, memory_cap_bytes=4 * (20 + 12) * 11
        )
        indices_large, _ = exact_cosine_knn(queries, corpus, 15)
        np.testing.assert_array_equal(indices_small, indices_large)
