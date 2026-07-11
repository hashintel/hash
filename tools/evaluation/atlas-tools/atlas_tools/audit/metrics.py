"""Prefix-audit metrics over neighbor index lists.

Exact definitions (these strings are embedded verbatim in ``report.json``):

- ``recall@k(d)``: mean over queries of ``|prefix_topk ∩ full_topk| / k``.
- ``intrusion_rate@k(d)``: mean over queries of the fraction of prefix top-k
  neighbors NOT in the full top-(3k).
- ``mean_rank_displacement@k(d)``: mean over queries and over prefix top-k
  neighbors of ``max(rank_full - rank_prefix, 0)``, where ``rank_prefix`` is
  the neighbor's 0-based position in the prefix list and ``rank_full`` is its
  0-based position in the full top-(3k) list, or ``3k`` if absent (intruders
  get the cap). Deterministic, simple, monotone-sensitive.
"""

from dataclasses import dataclass

import numpy as np

METRIC_DEFINITIONS: dict[str, str] = {
    "recall@k(d)": "mean over queries of |prefix_topk ∩ full_topk| / k",
    "intrusion_rate@k(d)": (
        "mean over queries of the fraction of prefix top-k neighbors NOT in"
        " the full top-(3k)"
    ),
    "mean_rank_displacement@k(d)": (
        "mean over queries and over prefix top-k neighbors of"
        " max(rank_full - rank_prefix, 0), where rank_prefix is the neighbor's"
        " 0-based position in the prefix list and rank_full is its 0-based"
        " position in the full top-(3k) list, or 3k if absent (intruders get"
        " the cap)"
    ),
}


@dataclass(frozen=True)
class PerQueryMetrics:
    """Per-query metric values, each an array of shape ``(n_queries,)``."""

    recall: np.ndarray
    intrusion_rate: np.ndarray
    mean_rank_displacement: np.ndarray


def rank_in_reference(
    candidates: np.ndarray,
    reference: np.ndarray,
    *,
    absent_rank: int,
    chunk: int = 4096,
) -> np.ndarray:
    """Per-row rank of each candidate within the reference list.

    ``candidates`` is ``(q, k)`` and ``reference`` is ``(q, m)``; the result
    is ``(q, k)`` where entry ``[i, j]`` is the 0-based position of
    ``candidates[i, j]`` in ``reference[i]``, or ``absent_rank`` if it does
    not appear. Processed in query chunks so the ``(q, k, m)`` comparison
    tensor stays bounded.
    """

    candidates = np.asarray(candidates, dtype=np.int64)
    reference = np.asarray(reference, dtype=np.int64)

    if candidates.ndim != 2 or reference.ndim != 2:
        raise ValueError("candidates and reference must be 2-d")

    if candidates.shape[0] != reference.shape[0]:
        raise ValueError(
            f"row mismatch: candidates {candidates.shape[0]} vs"
            f" reference {reference.shape[0]}"
        )

    n_queries, k = candidates.shape
    out = np.full((n_queries, k), absent_rank, dtype=np.int64)

    for start in range(0, n_queries, chunk):
        stop = min(start + chunk, n_queries)
        eq = candidates[start:stop, :, None] == reference[start:stop, None, :]
        found = eq.any(axis=2)
        first = eq.argmax(axis=2)
        out[start:stop] = np.where(found, first, absent_rank)

    return out


def per_query_metrics(
    prefix_idx: np.ndarray,
    full_idx: np.ndarray,
    k: int,
) -> PerQueryMetrics:
    """Compute all three metrics per query for a single ``k``.

    ``prefix_idx`` is the prefix-space top-``max_k`` neighbor index matrix
    (columns beyond ``k`` are ignored); ``full_idx`` is the full-vector
    top-``(3 * max_k)`` neighbor index matrix, of which the first ``3k``
    columns form the reference list. If the corpus is too small to hold
    ``3k`` neighbors, the reference list is simply the entire full ranking
    and no candidate can be absent from it.
    """

    if k <= 0:
        raise ValueError("k must be positive")

    if prefix_idx.shape[1] < k:
        raise ValueError(
            f"prefix neighbor list has {prefix_idx.shape[1]} columns; need {k}"
        )

    cap = 3 * k
    reference = full_idx[:, : min(cap, full_idx.shape[1])]
    ranks = rank_in_reference(prefix_idx[:, :k], reference, absent_rank=cap)

    recall = (ranks < k).mean(axis=1)
    intrusion = (ranks == cap).mean(axis=1)
    displacement = np.maximum(ranks - np.arange(k, dtype=np.int64), 0).mean(axis=1)

    return PerQueryMetrics(
        recall=recall,
        intrusion_rate=intrusion,
        mean_rank_displacement=displacement,
    )
