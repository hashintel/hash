"""Planted-shape generators (W3.1).

Each generator is a pure function ``fn(config, seed) -> Dataset`` producing
float32 embeddings, int64 edge pairs, int64 labels (-1 = unlabeled), and a
ground-truth descriptor. All randomness flows through
``np.random.default_rng(seed)``; identical (config, seed) yields identical
bytes. Embedding dimension is configurable (default 64); nothing hardcodes
it.

Shapes:

- ``bipartite_star``: documents with ~k items each; items have degree 1
  (an optional ``multi_parent_frac`` gives that fraction of items a second
  parent). Docs are drawn around ``n_topics`` topic centers and items
  around their parent doc; labels are topic ids.
- ``clique_communities``: c communities with dense intra-community random
  edges; embedding clusters aligned with communities; labels = community.
- ``chains``: document-flow chains (order -> item -> movement -> delivery)
  of configurable depth; edges link consecutive chain members; embeddings
  cluster by TYPE, not by chain; labels = type index.
- ``lattice_product``: two categorical factors; embeddings near the sum of
  the two factor vectors (ring/sheet structure); edges connect nodes
  sharing a factor level; labels = (factor_a, factor_b) cell id.
- ``noise_edges``: clustered embeddings + uniformly random edges (edges
  carry NO structure); labels = embedding cluster.
- ``isolates``: clustered embeddings where ``isolate_frac`` of nodes have
  zero edges; the rest get intra-cluster edges; labels = cluster.
- ``mixed``: weighted combination of other shapes concatenated into one
  dataset with node/label offsets recorded in the truth descriptor.

Use :func:`generate` to dispatch by shape name via :data:`REGISTRY`.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import numpy as np

from atlas_tools.battery.datasets import Dataset

CHAIN_TYPE_NAMES = ("order", "item", "movement", "delivery")


def _merge_config(
    defaults: dict[str, Any], config: dict[str, Any] | None
) -> dict[str, Any]:
    config = dict(config or {})
    unknown = sorted(set(config) - set(defaults))
    if unknown:
        raise ValueError(
            f"unknown generator config keys {unknown}; known keys: {sorted(defaults)}"
        )
    return {**defaults, **config}


def _cluster_embeddings(
    rng: np.random.Generator,
    n: int,
    dim: int,
    n_clusters: int,
    center_scale: float,
    noise: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Balanced gaussian clusters; returns (embeddings f32, labels int64)."""
    centers = center_scale * rng.normal(size=(n_clusters, dim))
    labels = rng.permutation(np.arange(n, dtype=np.int64) % n_clusters)
    emb = centers[labels] + noise * rng.normal(size=(n, dim))
    return emb.astype(np.float32), labels


def _canonical_edges(edges: np.ndarray) -> np.ndarray:
    """Undirected canonical form: sorted pairs, no self-loops, unique rows."""
    e = np.asarray(edges, dtype=np.int64).reshape(-1, 2)
    if len(e) == 0:
        return np.zeros((0, 2), dtype=np.int64)
    e = np.sort(e, axis=1)
    e = e[e[:, 0] != e[:, 1]]
    if len(e) == 0:
        return np.zeros((0, 2), dtype=np.int64)
    return np.unique(e, axis=0)


def _intra_group_edges(
    rng: np.random.Generator, groups: list[np.ndarray], degree: int
) -> np.ndarray:
    """Each node draws ``degree`` random same-group partners (no self)."""
    chunks = []
    for idx in groups:
        m = len(idx)
        if m < 2:
            continue
        a = np.repeat(idx, degree)
        b = idx[rng.integers(0, m, size=m * degree)]
        bad = a == b
        while bad.any():
            b[bad] = idx[rng.integers(0, m, size=int(bad.sum()))]
            bad = a == b
        chunks.append(np.stack([a, b], axis=1))
    if not chunks:
        return np.zeros((0, 2), dtype=np.int64)
    return np.concatenate(chunks)


BIPARTITE_STAR_DEFAULTS: dict[str, Any] = {
    "n": 20_000,
    "dim": 64,
    "items_per_doc": 8,
    "multi_parent_frac": 0.0,
    "n_topics": 10,
    "topic_scale": 1.0,
    "doc_noise": 0.25,
    "item_noise": 0.10,
}


def bipartite_star(config: dict[str, Any] | None, seed: int) -> Dataset:
    cfg = _merge_config(BIPARTITE_STAR_DEFAULTS, config)
    rng = np.random.default_rng(seed)
    n, dim, k = cfg["n"], cfg["dim"], cfg["items_per_doc"]

    n_docs = max(1, int(round(n / (k + 1))))
    n_docs = min(n_docs, n)
    n_items = n - n_docs

    topic_centers = cfg["topic_scale"] * rng.normal(size=(cfg["n_topics"], dim))
    doc_topic = rng.integers(0, cfg["n_topics"], size=n_docs).astype(np.int64)
    doc_emb = topic_centers[doc_topic] + cfg["doc_noise"] * rng.normal(
        size=(n_docs, dim)
    )
    parent = np.arange(n_items, dtype=np.int64) % n_docs  # round-robin
    item_emb = doc_emb[parent] + cfg["item_noise"] * rng.normal(size=(n_items, dim))
    embeddings = np.concatenate([doc_emb, item_emb]).astype(np.float32)

    item_ids = n_docs + np.arange(n_items, dtype=np.int64)
    edges = np.stack([parent, item_ids], axis=1)
    n_multi = 0
    if n_docs > 1 and cfg["multi_parent_frac"] > 0 and n_items > 0:
        n_multi = int(round(cfg["multi_parent_frac"] * n_items))
        chosen = rng.choice(n_items, size=n_multi, replace=False)
        # Second parent guaranteed distinct from the first.
        offset = 1 + rng.integers(0, n_docs - 1, size=n_multi)
        second = (parent[chosen] + offset) % n_docs
        edges = np.concatenate([edges, np.stack([second, item_ids[chosen]], axis=1)])

    labels = np.concatenate([doc_topic, doc_topic[parent]])
    truth = {
        "n_docs": int(n_docs),
        "n_items": int(n_items),
        "items_per_doc": int(k),
        "multi_parent_items": int(n_multi),
        "n_topics": int(cfg["n_topics"]),
        "doc_id_range": [0, int(n_docs)],
        "item_id_range": [int(n_docs), int(n)],
        "labels_are": "topic",
    }
    return Dataset(
        "bipartite_star", embeddings, _canonical_edges(edges), labels, truth, cfg, seed
    )


CLIQUE_COMMUNITIES_DEFAULTS: dict[str, Any] = {
    "n": 20_000,
    "dim": 64,
    "n_communities": 8,
    "intra_degree": 6,
    "noise": 0.15,
    "center_scale": 1.0,
}


def clique_communities(config: dict[str, Any] | None, seed: int) -> Dataset:
    cfg = _merge_config(CLIQUE_COMMUNITIES_DEFAULTS, config)
    rng = np.random.default_rng(seed)
    c = cfg["n_communities"]
    embeddings, labels = _cluster_embeddings(
        rng, cfg["n"], cfg["dim"], c, cfg["center_scale"], cfg["noise"]
    )
    groups = [np.nonzero(labels == ci)[0] for ci in range(c)]
    edges = _canonical_edges(_intra_group_edges(rng, groups, cfg["intra_degree"]))
    truth = {
        "n_communities": int(c),
        "intra_degree": int(cfg["intra_degree"]),
        "labels_are": "community",
    }
    return Dataset("clique_communities", embeddings, edges, labels, truth, cfg, seed)


CHAINS_DEFAULTS: dict[str, Any] = {
    "n": 20_000,
    "dim": 64,
    "depth": 4,
    "noise": 0.15,
    "center_scale": 1.0,
}


def chains(config: dict[str, Any] | None, seed: int) -> Dataset:
    cfg = _merge_config(CHAINS_DEFAULTS, config)
    rng = np.random.default_rng(seed)
    n, dim, depth = cfg["n"], cfg["dim"], cfg["depth"]
    type_names = [
        CHAIN_TYPE_NAMES[i] if i < len(CHAIN_TYPE_NAMES) else f"type_{i}"
        for i in range(depth)
    ]

    ids = np.arange(n, dtype=np.int64)
    type_id = ids % depth
    chain_id = ids // depth
    centers = cfg["center_scale"] * rng.normal(size=(depth, dim))
    embeddings = (centers[type_id] + cfg["noise"] * rng.normal(size=(n, dim))).astype(
        np.float32
    )

    src = ids[:-1]
    mask = chain_id[:-1] == chain_id[1:]
    edges = _canonical_edges(np.stack([src[mask], src[mask] + 1], axis=1))
    truth = {
        "depth": int(depth),
        "n_chains": int(math.ceil(n / depth)),
        "type_names": type_names,
        "labels_are": "type",
        "embeddings_cluster_by": "type",
    }
    return Dataset("chains", embeddings, edges, type_id, truth, cfg, seed)


LATTICE_PRODUCT_DEFAULTS: dict[str, Any] = {
    "n": 20_000,
    "dim": 64,
    "factor_a": 6,
    "factor_b": 8,
    "noise": 0.10,
    "center_scale": 1.0,
    "edges_per_factor": 1,
}


def lattice_product(config: dict[str, Any] | None, seed: int) -> Dataset:
    cfg = _merge_config(LATTICE_PRODUCT_DEFAULTS, config)
    rng = np.random.default_rng(seed)
    n, dim = cfg["n"], cfg["dim"]
    a, b = cfg["factor_a"], cfg["factor_b"]

    fa = rng.integers(0, a, size=n).astype(np.int64)
    fb = rng.integers(0, b, size=n).astype(np.int64)
    u = cfg["center_scale"] * rng.normal(size=(a, dim))
    v = cfg["center_scale"] * rng.normal(size=(b, dim))
    embeddings = (u[fa] + v[fb] + cfg["noise"] * rng.normal(size=(n, dim))).astype(
        np.float32
    )

    groups_a = [np.nonzero(fa == i)[0] for i in range(a)]
    groups_b = [np.nonzero(fb == i)[0] for i in range(b)]
    epf = cfg["edges_per_factor"]
    edges = _canonical_edges(
        np.concatenate(
            [
                _intra_group_edges(rng, groups_a, epf),
                _intra_group_edges(rng, groups_b, epf),
            ]
        )
    )
    labels = fa * b + fb
    truth = {
        "factor_a": int(a),
        "factor_b": int(b),
        "n_cells": int(a * b),
        "labels_are": "cell (factor_a * b + factor_b)",
    }
    return Dataset("lattice_product", embeddings, edges, labels, truth, cfg, seed)


NOISE_EDGES_DEFAULTS: dict[str, Any] = {
    "n": 20_000,
    "dim": 64,
    "n_clusters": 8,
    "noise": 0.15,
    "center_scale": 1.0,
    "edge_factor": 3.0,
}


def noise_edges(config: dict[str, Any] | None, seed: int) -> Dataset:
    cfg = _merge_config(NOISE_EDGES_DEFAULTS, config)
    rng = np.random.default_rng(seed)
    n = cfg["n"]
    embeddings, labels = _cluster_embeddings(
        rng, n, cfg["dim"], cfg["n_clusters"], cfg["center_scale"], cfg["noise"]
    )
    m = int(round(cfg["edge_factor"] * n))
    i = rng.integers(0, n, size=m)
    j = rng.integers(0, n, size=m)
    bad = i == j
    while bad.any():
        j[bad] = rng.integers(0, n, size=int(bad.sum()))
        bad = i == j
    edges = _canonical_edges(np.stack([i, j], axis=1))
    truth = {
        "n_clusters": int(cfg["n_clusters"]),
        "edges_random": True,
        "requested_edges": int(m),
        "unique_edges": int(len(edges)),
        "labels_are": "embedding cluster (independent of edges)",
    }
    return Dataset("noise_edges", embeddings, edges, labels, truth, cfg, seed)


ISOLATES_DEFAULTS: dict[str, Any] = {
    "n": 20_000,
    "dim": 64,
    "n_clusters": 8,
    "isolate_frac": 0.3,
    "intra_degree": 4,
    "noise": 0.15,
    "center_scale": 1.0,
}


def isolates(config: dict[str, Any] | None, seed: int) -> Dataset:
    cfg = _merge_config(ISOLATES_DEFAULTS, config)
    rng = np.random.default_rng(seed)
    n = cfg["n"]
    embeddings, labels = _cluster_embeddings(
        rng, n, cfg["dim"], cfg["n_clusters"], cfg["center_scale"], cfg["noise"]
    )
    n_iso = int(round(cfg["isolate_frac"] * n))
    perm = rng.permutation(n)
    rest = np.sort(perm[n_iso:])
    groups = [rest[labels[rest] == ci] for ci in range(cfg["n_clusters"])]
    edges = _canonical_edges(_intra_group_edges(rng, groups, cfg["intra_degree"]))
    truth = {
        "isolate_frac": float(cfg["isolate_frac"]),
        "n_isolates": int(n_iso),
        "n_clusters": int(cfg["n_clusters"]),
        "labels_are": "cluster",
    }
    return Dataset("isolates", embeddings, edges, labels, truth, cfg, seed)


MIXED_DEFAULT_COMPONENTS: list[dict[str, Any]] = [
    {"shape": "clique_communities", "weight": 0.35},
    {"shape": "bipartite_star", "weight": 0.25},
    {"shape": "chains", "weight": 0.2},
    {"shape": "isolates", "weight": 0.2},
]

MIXED_DEFAULTS: dict[str, Any] = {
    "n": 20_000,
    "dim": 64,
    "components": MIXED_DEFAULT_COMPONENTS,
}


def mixed(config: dict[str, Any] | None, seed: int) -> Dataset:
    cfg = _merge_config(MIXED_DEFAULTS, config)
    rng = np.random.default_rng(seed)
    n, dim = cfg["n"], cfg["dim"]
    components = cfg["components"]
    if not components:
        raise ValueError("mixed requires at least one component")
    if any(c["shape"] == "mixed" for c in components):
        raise ValueError("mixed components may not themselves be 'mixed'")

    total_weight = sum(float(c["weight"]) for c in components)
    sizes = [int(float(c["weight"]) / total_weight * n) for c in components]
    for i in range(n - sum(sizes)):  # distribute rounding remainder
        sizes[i % len(sizes)] += 1

    emb_parts: list[np.ndarray] = []
    edge_parts: list[np.ndarray] = []
    label_parts: list[np.ndarray] = []
    comp_truth: list[dict[str, Any]] = []
    node_offset = 0
    label_offset = 0
    for comp, size in zip(components, sizes):
        child_seed = int(rng.integers(0, 2**31 - 1))
        params = {"n": size, "dim": dim, **comp.get("params", {})}
        child = generate(comp["shape"], params, child_seed)
        emb_parts.append(child.embeddings)
        edge_parts.append(child.edges + node_offset)
        child_labels = child.labels.copy()
        labeled = child_labels >= 0
        child_labels[labeled] += label_offset
        label_parts.append(child_labels)
        comp_truth.append(
            {
                "shape": comp["shape"],
                "n": int(size),
                "node_offset": int(node_offset),
                "label_offset": int(label_offset),
                "seed": child_seed,
            }
        )
        if labeled.any():
            label_offset = int(child_labels[labeled].max()) + 1
        node_offset += size

    truth = {"components": comp_truth, "labels_are": "per-component, offset"}
    return Dataset(
        "mixed",
        np.concatenate(emb_parts),
        _canonical_edges(np.concatenate(edge_parts)),
        np.concatenate(label_parts),
        truth,
        cfg,
        seed,
    )


REGISTRY: dict[str, Callable[[dict[str, Any] | None, int], Dataset]] = {
    "bipartite_star": bipartite_star,
    "clique_communities": clique_communities,
    "chains": chains,
    "lattice_product": lattice_product,
    "noise_edges": noise_edges,
    "isolates": isolates,
    "mixed": mixed,
}


def generate(shape: str, config: dict[str, Any] | None, seed: int) -> Dataset:
    """Dispatch to a registered generator by shape name."""
    if shape not in REGISTRY:
        raise ValueError(f"unknown shape {shape!r}; known: {sorted(REGISTRY)}")
    return REGISTRY[shape](config, int(seed))
