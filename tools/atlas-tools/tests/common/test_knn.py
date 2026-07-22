import numpy as np
import pytest

from atlas_tools.common.knn import (
    _run_isolated_metal_worker,
    _search_plan,
    exact_cosine_knn,
    gpu_search_available,
    l2_normalize,
    metal_search_available,
    prefix_transform,
    resolve_search_backend,
)


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
        # The cap includes queries, result heaps, corpus/index batches, and search workspace.
        # 32 KiB forces several FAISS corpus blocks for this fixture.
        indices, scores = exact_cosine_knn(
            queries,
            corpus,
            10,
            memory_cap_bytes=32 << 10,
        )
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
            queries,
            corpus,
            15,
            memory_cap_bytes=24 << 10,
        )
        indices_large, _ = exact_cosine_knn(queries, corpus, 15)
        np.testing.assert_array_equal(indices_small, indices_large)

    def test_cutoff_ties_across_corpus_blocks(self) -> None:
        corpus = np.tile(np.array([[1.0, 0.0]], dtype=np.float32), (200, 1))
        queries = corpus[[0, 199]]
        excluded = np.array([0, 199], dtype=np.int64)

        indices, _ = exact_cosine_knn(
            queries,
            corpus,
            15,
            query_rows_in_corpus=excluded,
            memory_cap_bytes=4 << 10,
        )

        np.testing.assert_array_equal(indices[0], np.arange(1, 16))
        np.testing.assert_array_equal(indices[1], np.arange(15))

    def test_auto_prefers_an_available_gpu_backend(self) -> None:
        expected = "gpu" if gpu_search_available() else "cpu"
        assert resolve_search_backend("auto") == expected

    def test_isolated_metal_plan_bounds_cumulative_distance_buffers(self) -> None:
        memory_cap_bytes = 8 << 30
        full_plan = _search_plan(
            n_queries=20_000,
            n_corpus=985_932,
            dim=3072,
            search_k=151,
            has_exclusions=True,
            memory_cap_bytes=memory_cap_bytes,
            isolated_metal=True,
        )
        prefix_plan = _search_plan(
            n_queries=20_000,
            n_corpus=985_932,
            dim=128,
            search_k=51,
            has_exclusions=True,
            memory_cap_bytes=memory_cap_bytes,
            isolated_metal=True,
        )

        for plan in (full_plan, prefix_plan):
            retained_distance_bytes = (
                20_000 * plan.corpus_batch_rows * np.dtype(np.float32).itemsize
            )
            assert retained_distance_bytes <= memory_cap_bytes // 2
            assert plan.estimated_peak_bytes <= memory_cap_bytes
        assert 40_000 <= full_plan.corpus_batch_rows <= 50_000
        assert 50_000 <= prefix_plan.corpus_batch_rows <= 55_000

    @pytest.mark.skipif(not gpu_search_available(), reason="FAISS GPU backend unavailable")
    def test_gpu_matches_cpu(self) -> None:
        rng = np.random.default_rng(5)
        corpus = rng.standard_normal((1000, 64)).astype(np.float32)
        queries = corpus[:100]
        excluded = np.arange(100, dtype=np.int64)

        cpu_indices, cpu_scores = exact_cosine_knn(
            queries,
            corpus,
            20,
            query_rows_in_corpus=excluded,
            memory_cap_bytes=8 << 20,
            backend="cpu",
        )
        gpu_indices, gpu_scores = exact_cosine_knn(
            queries,
            corpus,
            20,
            query_rows_in_corpus=excluded,
            memory_cap_bytes=8 << 20,
            backend="gpu",
        )

        np.testing.assert_array_equal(gpu_indices, cpu_indices)
        np.testing.assert_allclose(gpu_scores, cpu_scores, atol=5e-6)

    @pytest.mark.skipif(
        not (gpu_search_available() and metal_search_available()),
        reason="FAISS Metal backend unavailable",
    )
    def test_isolated_metal_preserves_ties_and_exclusion_across_blocks(self) -> None:
        class RecordingProgress:
            def __init__(self) -> None:
                self.advanced = 0

            def phase(self, name: str, *, total: int | None = None) -> None:
                self.phase_name = name
                self.total = total

            def advance(self, count: int = 1) -> None:
                self.advanced += count

            def note(self, message: str) -> None:
                self.note_text = message

        corpus = np.tile(np.array([[1.0, 0.0]], dtype=np.float32), (60, 1))
        queries = corpus[[0, 59]]
        excluded = np.array([0, 59], dtype=np.int64)
        progress = RecordingProgress()

        indices, _ = exact_cosine_knn(
            queries,
            corpus,
            15,
            query_rows_in_corpus=excluded,
            memory_cap_bytes=2 << 10,
            backend="gpu",
            progress=progress,
        )

        np.testing.assert_array_equal(indices[0], np.arange(1, 16))
        np.testing.assert_array_equal(indices[1], np.arange(15))
        assert progress.total == len(queries) * len(corpus)
        assert progress.advanced == progress.total
        assert "isolated Metal workers" in progress.note_text

    def test_isolated_worker_failure_is_reported(self) -> None:
        with pytest.raises(RuntimeError, match="FAISS Metal worker failed"):
            _run_isolated_metal_worker(
                query_memory_name="atlas_tools_missing_query_memory",
                query_shape=(1, 1),
                corpus_memory_name="atlas_tools_missing_corpus_memory",
                corpus_shape=(1, 1),
                score_memory_name="atlas_tools_missing_score_memory",
                index_memory_name="atlas_tools_missing_index_memory",
                query_batch_rows=1,
                local_k=1,
            )

    def test_progress_covers_every_query_corpus_pair(self) -> None:
        class RecordingProgress:
            def __init__(self) -> None:
                self.total: int | None = None
                self.advanced = 0
                self.notes: list[str] = []

            def phase(self, name: str, *, total: int | None = None) -> None:
                self.phase_name = name
                self.total = total

            def advance(self, count: int = 1) -> None:
                self.advanced += count

            def note(self, message: str) -> None:
                self.notes.append(message)

        rng = np.random.default_rng(6)
        corpus = rng.standard_normal((300, 12)).astype(np.float32)
        queries = corpus[:20]
        progress = RecordingProgress()

        exact_cosine_knn(
            queries,
            corpus,
            10,
            memory_cap_bytes=24 << 10,
            progress=progress,
        )

        assert progress.total == len(queries) * len(corpus)
        assert progress.advanced == progress.total
        assert any("FAISS cpu" in note for note in progress.notes)

    def test_rejects_k_larger_than_available_corpus(self) -> None:
        corpus = np.eye(3, dtype=np.float32)
        with pytest.raises(ValueError, match="available corpus neighbors"):
            exact_cosine_knn(corpus[:1], corpus, 3, query_rows_in_corpus=np.array([0]))

    def test_rejects_zero_embedding_dimension(self) -> None:
        with pytest.raises(ValueError, match="embedding dimension must be positive"):
            exact_cosine_knn(
                np.empty((1, 0), dtype=np.float32),
                np.empty((3, 0), dtype=np.float32),
                1,
            )
