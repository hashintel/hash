"""Prefix transform and blockwise exact cosine kNN.

The blockwise search never materializes an ``n x n`` (or ``q x n``) score matrix: for ``q``
queries against an ``n x d`` corpus, the corpus is scanned in row blocks of size ``b`` chosen so
that the per-block score matrix plus the running top-k state fits the configured memory cap::

    bytes(block scores) = q * b * 4        (float32 scores)
    bytes(block rows)   = b * d * 4        (float32 corpus block, if copied)

    b = floor(cap_bytes / (4 * (q + d)))

For a reference workload of q=20_000 queries, d=3072, and an 8 GiB cap this gives roughly
b = 93_000 rows per block, so a corpus of one million rows is scanned in about 11 blocks and
peak resident memory stays well under a 32 GB machine even with the memmapped corpus pages
counted.
"""

from typing import Final

import numpy as np

DEFAULT_MEMORY_CAP_BYTES: Final = 8 << 30
_EPS: Final = 1e-12
_MATRIX_NDIM: Final = 2


def l2_normalize(x: np.ndarray, *, eps: float = _EPS) -> np.ndarray:
    """Normalize rows to unit L2 norm, guarding rows with near-zero norm.

    Rows whose norm falls below ``eps`` become zero vectors instead of being divided by a
    near-zero norm. Raises ``ValueError`` when the input contains non-finite values.
    """
    x = np.asarray(x, dtype=np.float32)
    if not np.isfinite(x).all():
        raise ValueError("input contains non-finite values")

    norms = np.linalg.norm(x, axis=-1, keepdims=True)
    safe = np.where(norms < eps, 1.0, norms)
    out = x / safe
    out[np.broadcast_to(norms < eps, out.shape)] = 0.0

    return out.astype(np.float32, copy=False)


def prefix_transform(x: np.ndarray, dim: int, *, eps: float = _EPS) -> np.ndarray:
    """Truncate rows to their first ``dim`` components, then L2-normalize the result.

    Truncation happens before renormalization, so prefix norms are recomputed from the
    surviving components; rows whose prefix norm falls below ``eps`` become zero vectors.
    Raises ``ValueError`` when the input is not a 2-d array, when ``dim`` is out of range
    for the input width, or when the input contains non-finite values.
    """
    x = np.asarray(x)
    if x.ndim != _MATRIX_NDIM:
        raise ValueError(f"expected a 2-d array, got shape {x.shape}")

    if not 0 < dim <= x.shape[1]:
        raise ValueError(f"prefix dim {dim} out of range for input with {x.shape[1]} dims")

    return l2_normalize(np.ascontiguousarray(x[:, :dim], dtype=np.float32), eps=eps)


def _block_rows(n_queries: int, dim: int, memory_cap_bytes: int) -> int:
    denominator = 4 * (n_queries + dim)

    return max(1, min(1 << 20, memory_cap_bytes // denominator))


def exact_cosine_knn(
    queries: np.ndarray,
    corpus: np.ndarray,
    k: int,
    *,
    query_rows_in_corpus: np.ndarray | None = None,
    memory_cap_bytes: int = DEFAULT_MEMORY_CAP_BYTES,
    normalized: bool = False,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute the exact cosine top-``k`` of ``queries`` against ``corpus``, blockwise.

    Returns ``(indices, scores)`` of shape ``(q, k)``, sorted by descending cosine
    similarity with deterministic tie-breaking: equal scores resolve to the lower corpus
    index. When ``query_rows_in_corpus`` is given (shape ``(q,)``), each query's own
    corpus row is excluded from its neighbor list. The corpus may be a memmap or a lazy
    slice of one; it is streamed in blocks sized to ``memory_cap_bytes`` and normalized
    in-stream. Pass ``normalized=True`` only when both inputs already have unit rows;
    normalization is then skipped on both sides.

    Raises ``ValueError`` when ``k`` is not positive, when query and corpus widths
    differ, when ``query_rows_in_corpus`` does not have shape ``(q,)``, or when the
    corpus is too small to supply ``k`` neighbors after self-exclusion.
    """
    if k <= 0:
        raise ValueError("k must be positive")

    q = l2_normalize(queries) if not normalized else np.asarray(queries, np.float32)
    n_queries = q.shape[0]
    n_corpus = corpus.shape[0]
    dim = corpus.shape[1]
    if q.shape[1] != dim:
        raise ValueError(f"dim mismatch: queries {q.shape[1]} vs corpus {dim}")

    exclude = None
    if query_rows_in_corpus is not None:
        exclude = np.asarray(query_rows_in_corpus, dtype=np.int64)
        if exclude.shape != (n_queries,):
            raise ValueError("query_rows_in_corpus must have shape (n_queries,)")

    effective_k = min(k, n_corpus - (0 if exclude is None else 1))
    if effective_k <= 0:
        raise ValueError("corpus too small for requested k")

    block = _block_rows(n_queries, dim, memory_cap_bytes)

    best_scores = np.full((n_queries, effective_k), -np.inf, dtype=np.float32)
    best_indices = np.full((n_queries, effective_k), -1, dtype=np.int64)

    for start in range(0, n_corpus, block):
        stop = min(start + block, n_corpus)
        rows = np.asarray(corpus[start:stop], dtype=np.float32)
        rows = rows if normalized else l2_normalize(rows)

        # Inputs are validated finite and unit-norm; Accelerate BLAS on macOS still raises
        # spurious divide/overflow floating-point warnings inside matmul.
        with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
            scores = q @ rows.T  # (n_queries, stop - start)

        if exclude is not None:
            in_block = (exclude >= start) & (exclude < stop)
            if in_block.any():
                hit_queries = np.nonzero(in_block)[0]
                scores[hit_queries, exclude[hit_queries] - start] = -np.inf

        block_indices = np.arange(start, stop, dtype=np.int64)
        merged_scores = np.concatenate([best_scores, scores], axis=1)
        merged_indices = np.concatenate(
            [best_indices, np.broadcast_to(block_indices, scores.shape)], axis=1
        )

        # Deterministic selection: sort by (-score, index).
        order = np.lexsort((merged_indices, -merged_scores), axis=1)[:, :effective_k]
        best_scores = np.take_along_axis(merged_scores, order, axis=1)
        best_indices = np.take_along_axis(merged_indices, order, axis=1)

    return best_indices, best_scores
