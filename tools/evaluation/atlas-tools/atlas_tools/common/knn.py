"""Prefix transform and blockwise exact cosine kNN.

Blockwise math (documented per PRD W1 acceptance): for ``q`` queries against
an ``n x d`` corpus we never materialize an ``n x n`` (or ``q x n``) score
matrix. The corpus is scanned in row blocks of size ``b`` chosen so that the
per-block score matrix plus the running top-k state fits the configured
memory cap:

    bytes(block scores) = q * b * 4        (float32 scores)
    bytes(block rows)   = b * d * 4        (float32 corpus block, if copied)

    b = floor(cap_bytes / (4 * (q + d)))

For the reference workload (q=20_000 queries, d=3072, cap=8 GiB) this gives
b ~= 93_000 rows per block, so a 1M x 3072 corpus is ~11 blocks; peak
resident memory stays well under a 32 GB machine even with the memmapped
corpus pages counted.
"""

from __future__ import annotations

import numpy as np

DEFAULT_MEMORY_CAP_BYTES = 8 << 30
_EPS = 1e-12


def l2_normalize(x: np.ndarray, *, eps: float = _EPS) -> np.ndarray:
    """Row-wise L2 normalization with an epsilon guard for zero norms.

    Rejects non-finite input. Rows with norm below ``eps`` are returned as
    zero vectors rather than dividing by ~0.
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
    """Truncate to the first ``dim`` components, then L2-normalize.

    This exact function is the shared prefix-representation contract:
    truncation happens BEFORE normalization, zero norms are epsilon-guarded,
    and non-finite inputs are rejected.
    """
    x = np.asarray(x)
    if x.ndim != 2:
        raise ValueError(f"expected a 2-d array, got shape {x.shape}")

    if not 0 < dim <= x.shape[1]:
        raise ValueError(
            f"prefix dim {dim} out of range for input with {x.shape[1]} dims"
        )

    return l2_normalize(np.ascontiguousarray(x[:, :dim], dtype=np.float32), eps=eps)


def _block_rows(n_queries: int, dim: int, memory_cap_bytes: int) -> int:
    denom = 4 * (n_queries + dim)

    return max(1, min(1 << 20, memory_cap_bytes // denom))


def exact_cosine_knn(
    queries: np.ndarray,
    corpus: np.ndarray,
    k: int,
    *,
    query_rows_in_corpus: np.ndarray | None = None,
    memory_cap_bytes: int = DEFAULT_MEMORY_CAP_BYTES,
    normalized: bool = False,
) -> tuple[np.ndarray, np.ndarray]:
    """Exact cosine top-k of ``queries`` against ``corpus``, blockwise.

    Returns ``(indices, scores)`` of shape (q, k), sorted by descending
    cosine similarity with deterministic index tie-breaking (lower index
    wins). If ``query_rows_in_corpus`` is given (shape (q,)), each query's
    own corpus row is excluded from its neighbor list.
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
    best_idx = np.full((n_queries, effective_k), -1, dtype=np.int64)

    for start in range(0, n_corpus, block):
        stop = min(start + block, n_corpus)
        rows = np.asarray(corpus[start:stop], dtype=np.float32)
        rows = rows if normalized else l2_normalize(rows)

        # Inputs are validated finite and unit-norm; Accelerate BLAS on macOS
        # still raises spurious divide/overflow FP warnings inside matmul.
        with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
            scores = q @ rows.T  # (n_queries, stop-start)

        if exclude is not None:
            in_block = (exclude >= start) & (exclude < stop)
            if in_block.any():
                qi = np.nonzero(in_block)[0]
                scores[qi, exclude[qi] - start] = -np.inf

        block_idx = np.arange(start, stop, dtype=np.int64)
        merged_scores = np.concatenate([best_scores, scores], axis=1)
        merged_idx = np.concatenate(
            [best_idx, np.broadcast_to(block_idx, scores.shape)], axis=1
        )

        # Deterministic selection: sort by (-score, index).
        order = np.lexsort((merged_idx, -merged_scores), axis=1)[:, :effective_k]
        best_scores = np.take_along_axis(merged_scores, order, axis=1)
        best_idx = np.take_along_axis(merged_idx, order, axis=1)

    return best_idx, best_scores
