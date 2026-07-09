"""Structure features for the layout encoder: depth-1 GraphSAGE, capped mean.

The encoder input is [emb ; neighbor_mean ; coherence ; deg_feat], width 2d+2:

  emb            the entity's truncated + renormalized embedding (d).
  neighbor_mean  mean of the truncated + renormalized embeddings of up to
                 `cap` selected neighbors, renormalized. Degree-0 (after hub
                 exclusion) entities get the zero vector: the explicit
                 "no structural signal" token; degree-0 examples must exist
                 in training.
  coherence      the pre-renormalization norm of the neighbor mean, one
                 scalar in [0, 1]: ~1 for a tight neighborhood, ~0 for a
                 diverse one. This is the signal renormalization would
                 otherwise destroy, and it lets the MLP learn to gate the
                 neighbor channel off when the neighborhood is incoherent.
  deg_feat       log1p(TRUE degree) / deg_norm. True degree, not capped:
                 the cap is a variance trick on the mean; degree is
                 information. deg_norm is frozen at fit time and shipped
                 in metadata.

NEIGHBOR SELECTION (frozen train/serve contract):
  bottom-k sketch: the `cap` neighbors with the smallest
  splitmix64(neighbor_id XOR salt). Deterministic given the edge set,
  independent of edge insertion order and of unrelated degree churn; an
  edge insert changes the selection by at most one member, so features
  (and positions) move by O(1/cap) per event. Serving may keep the k-th
  smallest hash per node (8 bytes) as a skip test: an inserted neighbor
  hashing above it provably cannot change the selection.

HUB EXCLUSION: pairs with either endpoint in `exclude` are dropped before
anything else, mirroring the relation-graph hub trim in app.layout. The
exclude set is frozen at fit time and shipped alongside the encoder;
serving must not re-derive it from live degrees.

SERVING (candle / Rust) must reproduce: truncate+renorm each embedding;
drop excluded pairs; bottom-k by the same hash and salt; mean, keep norm
as coherence, renormalize (zero stays zero); deg_feat from true degree
with shipped deg_norm; concat in the order above. Re-projection policy:
on sketch change, or when log1p(deg) has drifted more than a chosen delta
since the last projection; not on every increment.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class StructureFeatureParams:
    # Max neighbors averaged into neighbor_mean. Purely a variance trick:
    # past a few hundred samples the mean is stable, and the cap bounds
    # both the per-event feature drift (O(1/cap)) and serving cost.
    cap: int = 256
    # XORed into neighbor ids before hashing; part of the frozen
    # train/serve contract (shipped in metadata), not a security knob.
    salt: np.uint64 = np.uint64(0x5EED_00D5)


def splitmix64(x: np.ndarray) -> np.ndarray:
    """
    Vectorized splitmix64 finalizer over uint64: a well-mixed 64-bit
    hash that is trivial to reproduce bit-for-bit on the serving side.
    """
    x = x.astype(np.uint64, copy=True)
    # uint64 arithmetic wraps by design; silence numpy's overflow warning.
    with np.errstate(over="ignore"):
        x += np.uint64(0x9E3779B97F4A7C15)
        x ^= x >> np.uint64(30)
        x *= np.uint64(0xBF58476D1CE4E5B9)
        x ^= x >> np.uint64(27)
        x *= np.uint64(0x94D049BB133111EB)
        x ^= x >> np.uint64(31)
    return x


def structure_features(
    emb: np.ndarray,
    edges: np.ndarray,
    *,
    params: StructureFeatureParams = StructureFeatureParams(),
    exclude: np.ndarray | None = None,
    deg_norm: float | None = None,
) -> tuple[np.ndarray, float]:
    """
    Build (n, 2d + 2) float32 features.

    emb: (n, d) unit-norm float32. edges: (m, 2) int64 row-index pairs,
    direction ignored, self-loops and parallel duplicates dropped.
    exclude: row indices (frozen hub set); pairs touching them are
    dropped. Returns (features, deg_norm); pass deg_norm back in at
    inference.
    """
    n, d = emb.shape
    assert emb.dtype == np.float32, f"emb must be float32, got {emb.dtype}"

    if len(edges):
        src, dst = edges[:, 0], edges[:, 1]
        keep = src != dst
        if exclude is not None and len(exclude):
            ex = np.zeros(n, dtype=bool)
            ex[exclude] = True
            keep &= ~ex[src] & ~ex[dst]
        src, dst = src[keep], dst[keep]

        # Undirected view: emit both directions, then dedup so a parallel
        # or doubly-stored edge contributes one (node, neighbor) pair.
        node = np.concatenate([src, dst])
        neigh = np.concatenate([dst, src])
        pairs = np.unique(np.stack([node, neigh], axis=1), axis=0)
        node, neigh = pairs[:, 0], pairs[:, 1]
    else:
        node = neigh = np.empty(0, dtype=np.int64)

    deg = np.bincount(node, minlength=n)  # true degree (post-exclusion)

    # Bottom-k selection, vectorized: sort pairs by (node, hash), so each
    # node's neighbors form a contiguous run in hash order; a pair's rank
    # within its run is its global sorted position minus the run's start
    # (found by searchsorted); keep ranks below the cap.
    h = splitmix64(neigh.astype(np.uint64) ^ params.salt)
    order = np.lexsort((h, node))
    node_s, neigh_s = node[order], neigh[order]
    if len(node_s):
        starts = np.searchsorted(node_s, np.arange(n))
        rank = np.arange(len(node_s)) - starts[node_s]
        sel = rank < params.cap
        node_s, neigh_s = node_s[sel], neigh_s[sel]

    # Scatter-accumulate the selected neighbor embeddings per node.
    # np.add.at is the unbuffered form: repeated indices accumulate
    # (plain fancy-index += would drop all but one). float64 keeps the
    # mean stable across up to `cap` float32 summands.
    acc = np.zeros((n, d), dtype=np.float64)
    cnt = np.zeros(n, dtype=np.int64)
    if len(node_s):
        np.add.at(acc, node_s, emb[neigh_s])
        np.add.at(cnt, node_s, 1)

    # Split the mean into direction (renormalized) and length (coherence)
    # -- see the module docstring for why the length is kept as its own
    # channel. Degree-0 rows keep the zero vector and zero coherence.
    has = cnt > 0
    mean = np.zeros((n, d), dtype=np.float32)
    coherence = np.zeros(n, dtype=np.float32)
    if has.any():
        m = (acc[has] / cnt[has, None]).astype(np.float32)
        norms = np.linalg.norm(m, axis=1)
        coherence[has] = norms
        mean[has] = m / np.maximum(norms, 1e-12)[:, None]

    # Frozen at first fit (max observed degree), then passed back in so
    # the feature scale never shifts between fit and serving.
    if deg_norm is None:
        deg_norm = float(np.log1p(deg.max())) if deg.max() > 0 else 1.0
    deg_feat = (np.log1p(deg) / deg_norm).astype(np.float32)

    return (
        np.concatenate([emb, mean, coherence[:, None], deg_feat[:, None]], axis=1),
        deg_norm,
    )


def feature_meta(
    d: int,
    deg_norm: float,
    mrl_dim: int,
    *,
    params: StructureFeatureParams = StructureFeatureParams(),
) -> dict[str, str]:
    """Safetensors metadata the serving side validates against."""
    return {
        "feature_spec": json.dumps(
            [
                {"kind": "embedding", "dim": d},
                {
                    "kind": "neighbor_mean",
                    "dim": d,
                    "cap": params.cap,
                    "select": "bottom_k_splitmix64",
                },
                {"kind": "coherence", "dim": 1},
                {"kind": "log1p_degree_scaled", "dim": 1},
            ]
        ),
        "deg_norm": f"{deg_norm:.9g}",
        "salt": str(int(params.salt)),
        "mrl_dim": str(mrl_dim),
    }
