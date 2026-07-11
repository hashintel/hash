"""Generator tests (W3.1): shapes/dtypes, determinism, planted structure."""

import numpy as np
import pytest
from pydantic import ValidationError
from sklearn.metrics import silhouette_score

from atlas_tools.battery.datasets import load_dataset, write_dataset
from atlas_tools.battery.generators import (
    BipartiteStarGenerator,
    BipartiteStarParams,
    ChainsGenerator,
    ChainsParams,
    CliqueCommunitiesGenerator,
    CliqueCommunitiesParams,
    IsolatesGenerator,
    IsolatesParams,
    LatticeProductGenerator,
    LatticeProductParams,
    MixedComponent,
    MixedGenerator,
    MixedParams,
    NoiseEdgesGenerator,
    NoiseEdgesParams,
    generator_adapter,
    generator_shapes,
)

SMALL_N = 400
SMALL_DIM = 16


def small_mixed_components() -> list[MixedComponent]:
    return [
        MixedComponent(
            weight=0.35,
            generator=CliqueCommunitiesGenerator(
                params=CliqueCommunitiesParams(dim=SMALL_DIM)
            ),
        ),
        MixedComponent(
            weight=0.25,
            generator=BipartiteStarGenerator(params=BipartiteStarParams(dim=SMALL_DIM)),
        ),
        MixedComponent(
            weight=0.2,
            generator=ChainsGenerator(params=ChainsParams(dim=SMALL_DIM)),
        ),
        MixedComponent(
            weight=0.2,
            generator=IsolatesGenerator(params=IsolatesParams(dim=SMALL_DIM)),
        ),
    ]


SMALL_GENERATORS = [
    BipartiteStarGenerator(n=SMALL_N, params=BipartiteStarParams(dim=SMALL_DIM)),
    CliqueCommunitiesGenerator(
        n=SMALL_N, params=CliqueCommunitiesParams(dim=SMALL_DIM)
    ),
    ChainsGenerator(n=SMALL_N, params=ChainsParams(dim=SMALL_DIM)),
    LatticeProductGenerator(n=SMALL_N, params=LatticeProductParams(dim=SMALL_DIM)),
    NoiseEdgesGenerator(n=SMALL_N, params=NoiseEdgesParams(dim=SMALL_DIM)),
    IsolatesGenerator(n=SMALL_N, params=IsolatesParams(dim=SMALL_DIM)),
    MixedGenerator(n=SMALL_N, params=MixedParams(components=small_mixed_components())),
]


def test_union_covers_all_generators():
    assert generator_shapes() == tuple(
        sorted(generator.shape for generator in SMALL_GENERATORS)
    )


@pytest.mark.parametrize(
    "generator", SMALL_GENERATORS, ids=lambda generator: generator.shape
)
def test_shapes_and_dtypes(generator):
    dataset = generator.run(0)
    assert dataset.shape == generator.shape
    assert dataset.embeddings.shape == (SMALL_N, SMALL_DIM)
    assert dataset.embeddings.dtype == np.float32
    assert dataset.edges.dtype == np.int64
    assert dataset.edges.ndim == 2 and dataset.edges.shape[1] == 2
    if len(dataset.edges):
        assert dataset.edges.min() >= 0 and dataset.edges.max() < SMALL_N
        # canonical undirected form: sorted pairs, no self loops, unique
        assert (dataset.edges[:, 0] < dataset.edges[:, 1]).all()
        assert len(np.unique(dataset.edges, axis=0)) == len(dataset.edges)
    assert dataset.labels.shape == (SMALL_N,)
    assert dataset.labels.dtype == np.int64
    assert dataset.truth  # non-empty descriptor


@pytest.mark.parametrize(
    "generator", SMALL_GENERATORS, ids=lambda generator: generator.shape
)
def test_determinism_same_seed_identical_bytes(generator):
    a = generator.run(7)
    b = generator.run(7)
    assert a.embeddings.tobytes() == b.embeddings.tobytes()
    assert np.array_equal(a.edges, b.edges)
    assert np.array_equal(a.labels, b.labels)
    assert a.truth == b.truth
    c = generator.run(8)
    assert a.embeddings.tobytes() != c.embeddings.tobytes()


def test_unknown_param_rejected():
    with pytest.raises(ValidationError, match="typo_key"):
        CliqueCommunitiesParams(typo_key=1)
    with pytest.raises(ValidationError, match="not_a_shape"):
        generator_adapter.validate_python({"shape": "not_a_shape", "n": 100})


def test_adapter_dispatches_on_shape():
    generator = generator_adapter.validate_python(
        {"shape": "chains", "n": 100, "params": {"dim": 8, "depth": 2}}
    )
    assert isinstance(generator, ChainsGenerator)
    assert generator.n == 100
    assert generator.params.depth == 2


def test_mixed_components_must_share_dim():
    with pytest.raises(ValidationError, match="share one embedding dim"):
        MixedParams(
            components=[
                MixedComponent(
                    weight=0.5,
                    generator=ChainsGenerator(params=ChainsParams(dim=8)),
                ),
                MixedComponent(
                    weight=0.5,
                    generator=IsolatesGenerator(params=IsolatesParams(dim=16)),
                ),
            ]
        )


def test_mixed_inside_mixed_is_unrepresentable():
    # The component union is leaf-only: 'mixed' is not a valid component tag.
    with pytest.raises(ValidationError, match="mixed"):
        generator_adapter.validate_python(
            {
                "shape": "mixed",
                "n": 100,
                "params": {
                    "components": [{"weight": 1.0, "generator": {"shape": "mixed"}}]
                },
            }
        )


def test_bipartite_star_items_have_degree_one():
    dataset = SMALL_GENERATORS[0].run(0)
    n_docs = dataset.truth["n_docs"]
    degree = np.bincount(dataset.edges.ravel(), minlength=dataset.n)
    item_degrees = degree[n_docs:]
    assert (item_degrees == 1).all()
    # docs carry the remaining endpoints
    assert degree[:n_docs].sum() == len(dataset.edges)


def test_bipartite_star_multi_parent_fraction():
    generator = BipartiteStarGenerator(
        n=SMALL_N, params=BipartiteStarParams(dim=SMALL_DIM, multi_parent_frac=0.25)
    )
    dataset = generator.run(0)
    n_docs = dataset.truth["n_docs"]
    degree = np.bincount(dataset.edges.ravel(), minlength=dataset.n)
    item_degrees = degree[n_docs:]
    n_items = dataset.truth["n_items"]
    expected_multi = round(0.25 * n_items)
    assert dataset.truth["multi_parent_items"] == expected_multi
    assert (item_degrees == 2).sum() == expected_multi
    assert (item_degrees == 1).sum() == n_items - expected_multi


def test_clique_communities_embeddings_cluster_by_community():
    dataset = SMALL_GENERATORS[1].run(0)
    score = silhouette_score(dataset.embeddings, dataset.labels)
    assert score > 0.2
    # every edge is intra-community
    assert (
        dataset.labels[dataset.edges[:, 0]] == dataset.labels[dataset.edges[:, 1]]
    ).all()


def test_chains_labels_reflect_type_and_edges_stay_in_chain():
    generator = ChainsGenerator(n=SMALL_N, params=ChainsParams(dim=SMALL_DIM, depth=4))
    dataset = generator.run(0)
    assert np.array_equal(dataset.labels, np.arange(SMALL_N, dtype=np.int64) % 4)
    # edges connect consecutive members of the same chain
    assert (dataset.edges[:, 1] - dataset.edges[:, 0] == 1).all()
    assert (dataset.edges[:, 0] // 4 == dataset.edges[:, 1] // 4).all()
    # embeddings cluster by type, not by chain
    assert silhouette_score(dataset.embeddings, dataset.labels) > 0.2
    chain_ids = np.arange(SMALL_N) // 4
    assert silhouette_score(dataset.embeddings, chain_ids) < 0.05


def test_lattice_product_same_cell_pairs_are_close():
    generator = LatticeProductGenerator(
        n=SMALL_N,
        params=LatticeProductParams(dim=SMALL_DIM, factor_a=4, factor_b=5),
    )
    dataset = generator.run(0)
    assert dataset.truth["n_cells"] == 20
    rng = np.random.default_rng(0)
    embeddings = dataset.embeddings.astype(np.float64)
    same_dists, rand_dists = [], []
    for cell in np.unique(dataset.labels):
        idx = np.nonzero(dataset.labels == cell)[0]
        if len(idx) < 2:
            continue
        pick = rng.choice(idx, size=(20, 2))
        pick = pick[pick[:, 0] != pick[:, 1]]
        same_dists.append(
            np.linalg.norm(embeddings[pick[:, 0]] - embeddings[pick[:, 1]], axis=1)
        )
    i = rng.integers(0, dataset.n, 500)
    j = rng.integers(0, dataset.n, 500)
    keep = i != j
    rand_dists = np.linalg.norm(embeddings[i[keep]] - embeddings[j[keep]], axis=1)
    assert np.mean(np.concatenate(same_dists)) < 0.5 * np.mean(rand_dists)


def test_noise_edges_are_independent_of_labels():
    generator = NoiseEdgesGenerator(
        n=SMALL_N, params=NoiseEdgesParams(dim=SMALL_DIM, n_clusters=8)
    )
    dataset = generator.run(0)
    intra = (
        dataset.labels[dataset.edges[:, 0]] == dataset.labels[dataset.edges[:, 1]]
    ).mean()
    # random edges land intra-cluster ~1/c of the time; far from clustered (~1)
    assert intra < 0.25
    assert dataset.truth["edges_random"] is True


def test_isolates_have_zero_edges():
    generator = IsolatesGenerator(
        n=SMALL_N, params=IsolatesParams(dim=SMALL_DIM, isolate_frac=0.3)
    )
    dataset = generator.run(0)
    degree = np.bincount(dataset.edges.ravel(), minlength=dataset.n)
    assert (degree == 0).sum() >= dataset.truth["n_isolates"]
    assert dataset.truth["n_isolates"] == round(0.3 * SMALL_N)


def test_mixed_concatenates_components_with_offsets():
    dataset = SMALL_GENERATORS[-1].run(0)
    assert dataset.n == SMALL_N
    components = dataset.truth["components"]
    assert sum(c["n"] for c in components) == SMALL_N
    # labels of different components are disjoint (offsets applied)
    seen: set[int] = set()
    for component in components:
        lo, hi = component["node_offset"], component["node_offset"] + component["n"]
        component_labels = set(dataset.labels[lo:hi].tolist()) - {-1}
        assert not (component_labels & seen)
        seen |= component_labels
    # edges never cross component boundaries
    starts = np.array([c["node_offset"] for c in components] + [SMALL_N])
    component_of = np.searchsorted(starts, np.arange(SMALL_N), side="right")
    assert (
        component_of[dataset.edges[:, 0]] == component_of[dataset.edges[:, 1]]
    ).all()


def test_dataset_roundtrip_and_deterministic_artifact_bytes(tmp_path):
    generator = CliqueCommunitiesGenerator(n=120, params=CliqueCommunitiesParams(dim=8))
    dataset = generator.run(3)
    hashes_a = write_dataset(dataset, tmp_path / "a")
    hashes_b = write_dataset(dataset, tmp_path / "b")
    # content hashes identical across writes (created_at excluded from hashes)
    for key in (
        "embeddings_sha256",
        "edges_sha256",
        "labels_sha256",
        "truth_config_hash",
    ):
        assert hashes_a[key] == hashes_b[key]

    loaded = load_dataset(tmp_path / "a")
    assert loaded.shape == dataset.shape
    assert np.array_equal(loaded.embeddings, dataset.embeddings)
    assert np.array_equal(loaded.edges, dataset.edges)
    assert np.array_equal(loaded.labels, dataset.labels)
    assert loaded.truth == dataset.truth
    assert loaded.seed == 3
