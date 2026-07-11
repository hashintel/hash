"""Generator tests (W3.1): shapes/dtypes, determinism, planted structure."""

import numpy as np
import pytest
from atlas_tools.battery.datasets import load_dataset, write_dataset
from atlas_tools.battery.generators import REGISTRY, generate
from sklearn.metrics import silhouette_score

SMALL = {"n": 400, "dim": 16}


@pytest.mark.parametrize("shape", sorted(REGISTRY))
def test_shapes_and_dtypes(shape):
    ds = generate(shape, SMALL, seed=0)
    assert ds.shape == shape
    assert ds.embeddings.shape == (400, 16)
    assert ds.embeddings.dtype == np.float32
    assert ds.edges.dtype == np.int64
    assert ds.edges.ndim == 2 and ds.edges.shape[1] == 2
    if len(ds.edges):
        assert ds.edges.min() >= 0 and ds.edges.max() < 400
        # canonical undirected form: sorted pairs, no self loops, unique
        assert (ds.edges[:, 0] < ds.edges[:, 1]).all()
        assert len(np.unique(ds.edges, axis=0)) == len(ds.edges)
    assert ds.labels.shape == (400,)
    assert ds.labels.dtype == np.int64
    assert ds.truth  # non-empty descriptor


@pytest.mark.parametrize("shape", sorted(REGISTRY))
def test_determinism_same_seed_identical_bytes(shape):
    a = generate(shape, SMALL, seed=7)
    b = generate(shape, SMALL, seed=7)
    assert a.embeddings.tobytes() == b.embeddings.tobytes()
    assert np.array_equal(a.edges, b.edges)
    assert np.array_equal(a.labels, b.labels)
    assert a.truth == b.truth
    c = generate(shape, SMALL, seed=8)
    assert a.embeddings.tobytes() != c.embeddings.tobytes()


def test_unknown_config_key_rejected():
    with pytest.raises(ValueError, match="unknown generator config keys"):
        generate("clique_communities", {"n": 100, "typo_key": 1}, seed=0)
    with pytest.raises(ValueError, match="unknown shape"):
        generate("not_a_shape", {}, seed=0)


def test_bipartite_star_items_have_degree_one():
    ds = generate("bipartite_star", SMALL, seed=0)
    n_docs = ds.truth["n_docs"]
    degree = np.bincount(ds.edges.ravel(), minlength=ds.n)
    item_degrees = degree[n_docs:]
    assert (item_degrees == 1).all()
    # docs carry the remaining endpoints
    assert degree[:n_docs].sum() == len(ds.edges)


def test_bipartite_star_multi_parent_fraction():
    ds = generate("bipartite_star", {**SMALL, "multi_parent_frac": 0.25}, seed=0)
    n_docs = ds.truth["n_docs"]
    degree = np.bincount(ds.edges.ravel(), minlength=ds.n)
    item_degrees = degree[n_docs:]
    n_items = ds.truth["n_items"]
    expected_multi = round(0.25 * n_items)
    assert ds.truth["multi_parent_items"] == expected_multi
    assert (item_degrees == 2).sum() == expected_multi
    assert (item_degrees == 1).sum() == n_items - expected_multi


def test_clique_communities_embeddings_cluster_by_community():
    ds = generate("clique_communities", SMALL, seed=0)
    score = silhouette_score(ds.embeddings, ds.labels)
    assert score > 0.2
    # every edge is intra-community
    assert (ds.labels[ds.edges[:, 0]] == ds.labels[ds.edges[:, 1]]).all()


def test_chains_labels_reflect_type_and_edges_stay_in_chain():
    ds = generate("chains", {**SMALL, "depth": 4}, seed=0)
    assert np.array_equal(ds.labels, np.arange(400, dtype=np.int64) % 4)
    # edges connect consecutive members of the same chain
    assert (ds.edges[:, 1] - ds.edges[:, 0] == 1).all()
    assert (ds.edges[:, 0] // 4 == ds.edges[:, 1] // 4).all()
    # embeddings cluster by type, not by chain
    assert silhouette_score(ds.embeddings, ds.labels) > 0.2
    chain_ids = np.arange(400) // 4
    assert silhouette_score(ds.embeddings, chain_ids) < 0.05


def test_lattice_product_same_cell_pairs_are_close():
    ds = generate("lattice_product", {**SMALL, "factor_a": 4, "factor_b": 5}, seed=0)
    assert ds.truth["n_cells"] == 20
    rng = np.random.default_rng(0)
    emb = ds.embeddings.astype(np.float64)
    same_dists, rand_dists = [], []
    for cell in np.unique(ds.labels):
        idx = np.nonzero(ds.labels == cell)[0]
        if len(idx) < 2:
            continue
        pick = rng.choice(idx, size=(20, 2))
        pick = pick[pick[:, 0] != pick[:, 1]]
        same_dists.append(np.linalg.norm(emb[pick[:, 0]] - emb[pick[:, 1]], axis=1))
    i = rng.integers(0, ds.n, 500)
    j = rng.integers(0, ds.n, 500)
    keep = i != j
    rand_dists = np.linalg.norm(emb[i[keep]] - emb[j[keep]], axis=1)
    assert np.mean(np.concatenate(same_dists)) < 0.5 * np.mean(rand_dists)


def test_noise_edges_are_independent_of_labels():
    ds = generate("noise_edges", {**SMALL, "n_clusters": 8}, seed=0)
    intra = (ds.labels[ds.edges[:, 0]] == ds.labels[ds.edges[:, 1]]).mean()
    # random edges land intra-cluster ~1/c of the time; far from clustered (~1)
    assert intra < 0.25
    assert ds.truth["edges_random"] is True


def test_isolates_have_zero_edges():
    ds = generate("isolates", {**SMALL, "isolate_frac": 0.3}, seed=0)
    degree = np.bincount(ds.edges.ravel(), minlength=ds.n)
    assert (degree == 0).sum() >= ds.truth["n_isolates"]
    assert ds.truth["n_isolates"] == round(0.3 * 400)


def test_mixed_concatenates_components_with_offsets():
    ds = generate("mixed", SMALL, seed=0)
    assert ds.n == 400
    components = ds.truth["components"]
    assert sum(c["n"] for c in components) == 400
    # labels of different components are disjoint (offsets applied)
    seen: set[int] = set()
    for comp in components:
        lo, hi = comp["node_offset"], comp["node_offset"] + comp["n"]
        comp_labels = set(ds.labels[lo:hi].tolist()) - {-1}
        assert not (comp_labels & seen)
        seen |= comp_labels
    # edges never cross component boundaries
    starts = np.array([c["node_offset"] for c in components] + [400])
    comp_of = np.searchsorted(starts, np.arange(400), side="right")
    assert (comp_of[ds.edges[:, 0]] == comp_of[ds.edges[:, 1]]).all()


def test_dataset_roundtrip_and_deterministic_artifact_bytes(tmp_path):
    ds = generate("clique_communities", {"n": 120, "dim": 8}, seed=3)
    hashes_a = write_dataset(ds, tmp_path / "a")
    hashes_b = write_dataset(ds, tmp_path / "b")
    # content hashes identical across writes (created_at excluded from hashes)
    for key in (
        "embeddings_sha256",
        "edges_sha256",
        "labels_sha256",
        "truth_config_hash",
    ):
        assert hashes_a[key] == hashes_b[key]

    loaded = load_dataset(tmp_path / "a")
    assert loaded.shape == ds.shape
    assert np.array_equal(loaded.embeddings, ds.embeddings)
    assert np.array_equal(loaded.edges, ds.edges)
    assert np.array_equal(loaded.labels, ds.labels)
    assert loaded.truth == ds.truth
    assert loaded.seed == 3
