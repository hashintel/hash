"""Planted-shape generators (W3.1).

Each generator is a typed pydantic model: a per-shape ``*Params`` model
(validated, ``extra="forbid"``) wrapped by a ``*Generator`` class carrying
the ``shape`` discriminator and the node count ``n``. ``run(seed)`` is a
pure function of (model, seed) producing float32 embeddings, int64 edge
pairs, int64 labels (-1 = unlabeled), and a ground-truth descriptor. All
randomness flows through ``np.random.default_rng(seed)``; identical
(config, seed) yields identical bytes. Embedding dimension is configurable
(default 64); nothing hardcodes it.

:data:`Generator` is the discriminated union over all shapes — the union
IS the dispatch; there is no registry. Suite YAML entries
(``{shape, n, params}``) validate directly into generator instances via
:data:`generator_adapter`; call ``.run(seed)`` on the result.

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
"""

import math
from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Annotated, Literal, Self, TypeAliasType, get_args

import numpy as np
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    FiniteFloat,
    JsonValue,
    NonNegativeFloat,
    PositiveFloat,
    PositiveInt,
    TypeAdapter,
    model_validator,
)
from pydantic.fields import FieldInfo

from atlas_tools.battery.datasets import Dataset
from atlas_tools.common import JsonDict

CHAIN_TYPE_NAMES = ("order", "item", "movement", "delivery")

type Fraction = Annotated[float, Field(ge=0.0, le=1.0)]


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
    embeddings = centers[labels] + noise * rng.normal(size=(n, dim))

    return embeddings.astype(np.float32), labels


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


class GeneratorParams(BaseModel):
    """Base for per-shape parameter models; unknown keys are rejected."""

    model_config = ConfigDict(extra="forbid")


class AbstractGenerator[TParams: GeneratorParams](BaseModel, ABC):
    params: TParams
    n: PositiveInt = 20_000

    model_config = ConfigDict(extra="forbid")

    @abstractmethod
    def run(self, seed: int) -> Dataset: ...

    def config(self) -> JsonDict:
        """Resolved config recorded in ``truth.json`` (shape + n + params)."""
        return self.model_dump(mode="json")


class BipartiteStarParams(GeneratorParams):
    dim: PositiveInt = 64
    items_per_doc: PositiveInt = 8
    multi_parent_frac: Fraction = 0.0
    n_topics: PositiveInt = 10
    topic_scale: FiniteFloat = 1.0
    doc_noise: FiniteFloat = 0.25
    item_noise: FiniteFloat = 0.10


class BipartiteStarGenerator(AbstractGenerator[BipartiteStarParams]):
    shape: Literal["bipartite_star"] = "bipartite_star"
    params: BipartiteStarParams = Field(default_factory=BipartiteStarParams)

    def run(self, seed: int) -> Dataset:
        rng = np.random.default_rng(seed)
        n, dim, k = self.n, self.params.dim, self.params.items_per_doc

        n_docs = max(1, int(round(n / (k + 1))))
        n_docs = min(n_docs, n)
        n_items = n - n_docs

        topic_centers = self.params.topic_scale * rng.normal(
            size=(self.params.n_topics, dim)
        )

        doc_topic = rng.integers(0, self.params.n_topics, size=n_docs).astype(np.int64)
        doc_embeddings = topic_centers[doc_topic] + self.params.doc_noise * rng.normal(
            size=(n_docs, dim)
        )

        parent = np.arange(n_items, dtype=np.int64) % n_docs  # round-robin
        item_embeddings = doc_embeddings[parent] + self.params.item_noise * rng.normal(
            size=(n_items, dim)
        )

        embeddings = np.concatenate([doc_embeddings, item_embeddings]).astype(
            np.float32
        )

        item_ids = n_docs + np.arange(n_items, dtype=np.int64)
        edges = np.stack([parent, item_ids], axis=1)
        n_multi = 0

        if n_docs > 1 and self.params.multi_parent_frac > 0 and n_items > 0:
            n_multi = int(round(self.params.multi_parent_frac * n_items))
            chosen = rng.choice(n_items, size=n_multi, replace=False)

            # Second parent guaranteed distinct from the first.
            offset = 1 + rng.integers(0, n_docs - 1, size=n_multi)
            second = (parent[chosen] + offset) % n_docs
            edges = np.concatenate(
                [edges, np.stack([second, item_ids[chosen]], axis=1)]
            )

        labels = np.concatenate([doc_topic, doc_topic[parent]])
        truth: JsonDict = {
            "n_docs": n_docs,
            "n_items": n_items,
            "items_per_doc": k,
            "multi_parent_items": n_multi,
            "n_topics": self.params.n_topics,
            "doc_id_range": [0, n_docs],
            "item_id_range": [n_docs, n],
            "labels_are": "topic",
        }

        return Dataset(
            "bipartite_star",
            embeddings,
            _canonical_edges(edges),
            labels,
            truth,
            self.config(),
            seed,
        )


class CliqueCommunitiesParams(GeneratorParams):
    dim: PositiveInt = 64
    n_communities: PositiveInt = 8
    intra_degree: PositiveInt = 6
    noise: FiniteFloat = 0.15
    center_scale: FiniteFloat = 1.0


class CliqueCommunitiesGenerator(AbstractGenerator[CliqueCommunitiesParams]):
    shape: Literal["clique_communities"] = "clique_communities"
    params: CliqueCommunitiesParams = Field(default_factory=CliqueCommunitiesParams)

    def run(self, seed: int) -> Dataset:
        rng = np.random.default_rng(seed)
        n_communities = self.params.n_communities

        embeddings, labels = _cluster_embeddings(
            rng,
            self.n,
            self.params.dim,
            n_communities,
            self.params.center_scale,
            self.params.noise,
        )

        groups = [
            np.nonzero(labels == community)[0] for community in range(n_communities)
        ]
        edges = _canonical_edges(
            _intra_group_edges(rng, groups, self.params.intra_degree)
        )

        truth: JsonDict = {
            "n_communities": n_communities,
            "intra_degree": self.params.intra_degree,
            "labels_are": "community",
        }

        return Dataset(
            "clique_communities", embeddings, edges, labels, truth, self.config(), seed
        )


class ChainsParams(GeneratorParams):
    dim: PositiveInt = 64
    depth: PositiveInt = 4
    noise: FiniteFloat = 0.15
    center_scale: FiniteFloat = 1.0


class ChainsGenerator(AbstractGenerator[ChainsParams]):
    shape: Literal["chains"] = "chains"
    params: ChainsParams = Field(default_factory=ChainsParams)

    def run(self, seed: int) -> Dataset:
        rng = np.random.default_rng(seed)
        n, dim, depth = self.n, self.params.dim, self.params.depth

        type_names = [
            CHAIN_TYPE_NAMES[i] if i < len(CHAIN_TYPE_NAMES) else f"type_{i}"
            for i in range(depth)
        ]

        ids = np.arange(n, dtype=np.int64)
        type_id = ids % depth
        chain_id = ids // depth

        centers = self.params.center_scale * rng.normal(size=(depth, dim))
        embeddings = (
            centers[type_id] + self.params.noise * rng.normal(size=(n, dim))
        ).astype(np.float32)

        source = ids[:-1]
        mask = chain_id[:-1] == chain_id[1:]
        edges = _canonical_edges(np.stack([source[mask], source[mask] + 1], axis=1))

        truth: JsonDict = {
            "depth": depth,
            "n_chains": math.ceil(n / depth),
            "type_names": type_names,
            "labels_are": "type",
            "embeddings_cluster_by": "type",
        }

        return Dataset("chains", embeddings, edges, type_id, truth, self.config(), seed)


class LatticeProductParams(GeneratorParams):
    dim: PositiveInt = 64
    factor_a: PositiveInt = 6
    factor_b: PositiveInt = 8
    noise: FiniteFloat = 0.10
    center_scale: FiniteFloat = 1.0
    edges_per_factor: PositiveInt = 1


class LatticeProductGenerator(AbstractGenerator[LatticeProductParams]):
    shape: Literal["lattice_product"] = "lattice_product"
    params: LatticeProductParams = Field(default_factory=LatticeProductParams)

    def run(self, seed: int) -> Dataset:
        rng = np.random.default_rng(seed)
        n, dim = self.n, self.params.dim
        a, b = self.params.factor_a, self.params.factor_b

        level_a = rng.integers(0, a, size=n).astype(np.int64)
        level_b = rng.integers(0, b, size=n).astype(np.int64)
        vectors_a = self.params.center_scale * rng.normal(size=(a, dim))
        vectors_b = self.params.center_scale * rng.normal(size=(b, dim))
        embeddings = (
            vectors_a[level_a]
            + vectors_b[level_b]
            + self.params.noise * rng.normal(size=(n, dim))
        ).astype(np.float32)

        groups_a = [np.nonzero(level_a == level)[0] for level in range(a)]
        groups_b = [np.nonzero(level_b == level)[0] for level in range(b)]
        edges = _canonical_edges(
            np.concatenate(
                [
                    _intra_group_edges(rng, groups_a, self.params.edges_per_factor),
                    _intra_group_edges(rng, groups_b, self.params.edges_per_factor),
                ]
            )
        )

        labels = level_a * b + level_b
        truth: JsonDict = {
            "factor_a": a,
            "factor_b": b,
            "n_cells": a * b,
            "labels_are": "cell (factor_a * b + factor_b)",
        }

        return Dataset(
            "lattice_product", embeddings, edges, labels, truth, self.config(), seed
        )


class NoiseEdgesParams(GeneratorParams):
    dim: PositiveInt = 64
    n_clusters: PositiveInt = 8
    noise: FiniteFloat = 0.15
    center_scale: FiniteFloat = 1.0
    edge_factor: NonNegativeFloat = 3.0


class NoiseEdgesGenerator(AbstractGenerator[NoiseEdgesParams]):
    shape: Literal["noise_edges"] = "noise_edges"
    params: NoiseEdgesParams = Field(default_factory=NoiseEdgesParams)

    def run(self, seed: int) -> Dataset:
        rng = np.random.default_rng(seed)
        n = self.n

        embeddings, labels = _cluster_embeddings(
            rng,
            n,
            self.params.dim,
            self.params.n_clusters,
            self.params.center_scale,
            self.params.noise,
        )

        requested = int(round(self.params.edge_factor * n))
        i = rng.integers(0, n, size=requested)
        j = rng.integers(0, n, size=requested)

        bad = i == j
        while bad.any():
            j[bad] = rng.integers(0, n, size=int(bad.sum()))
            bad = i == j

        edges = _canonical_edges(np.stack([i, j], axis=1))

        truth: JsonDict = {
            "n_clusters": self.params.n_clusters,
            "edges_random": True,
            "requested_edges": requested,
            "unique_edges": int(len(edges)),
            "labels_are": "embedding cluster (independent of edges)",
        }

        return Dataset(
            "noise_edges", embeddings, edges, labels, truth, self.config(), seed
        )


class IsolatesParams(GeneratorParams):
    dim: PositiveInt = 64
    n_clusters: PositiveInt = 8
    isolate_frac: Fraction = 0.3
    intra_degree: PositiveInt = 4
    noise: FiniteFloat = 0.15
    center_scale: FiniteFloat = 1.0


class IsolatesGenerator(AbstractGenerator[IsolatesParams]):
    shape: Literal["isolates"] = "isolates"
    params: IsolatesParams = Field(default_factory=IsolatesParams)

    def run(self, seed: int) -> Dataset:
        rng = np.random.default_rng(seed)
        n = self.n

        embeddings, labels = _cluster_embeddings(
            rng,
            n,
            self.params.dim,
            self.params.n_clusters,
            self.params.center_scale,
            self.params.noise,
        )

        n_isolates = int(round(self.params.isolate_frac * n))
        permutation = rng.permutation(n)
        connected = np.sort(permutation[n_isolates:])

        groups = [
            connected[labels[connected] == cluster]
            for cluster in range(self.params.n_clusters)
        ]
        edges = _canonical_edges(
            _intra_group_edges(rng, groups, self.params.intra_degree)
        )

        truth: JsonDict = {
            "isolate_frac": self.params.isolate_frac,
            "n_isolates": n_isolates,
            "n_clusters": self.params.n_clusters,
            "labels_are": "cluster",
        }

        return Dataset(
            "isolates", embeddings, edges, labels, truth, self.config(), seed
        )


type LeafGenerator = Annotated[
    BipartiteStarGenerator
    | CliqueCommunitiesGenerator
    | ChainsGenerator
    | LatticeProductGenerator
    | NoiseEdgesGenerator
    | IsolatesGenerator,
    Field(discriminator="shape"),
]
"""Every shape except ``mixed`` — mixed components are leaves, so
"mixed inside mixed" is unrepresentable rather than merely checked."""


class MixedComponent(BaseModel):
    weight: PositiveFloat
    # The component's ``n`` is ignored: component sizes are derived from
    # ``weight`` over the mixed generator's total ``n``.
    generator: LeafGenerator

    model_config = ConfigDict(extra="forbid")


def _default_mixed_components() -> list[MixedComponent]:
    return [
        MixedComponent(weight=0.35, generator=CliqueCommunitiesGenerator()),
        MixedComponent(weight=0.25, generator=BipartiteStarGenerator()),
        MixedComponent(weight=0.2, generator=ChainsGenerator()),
        MixedComponent(weight=0.2, generator=IsolatesGenerator()),
    ]


class MixedParams(GeneratorParams):
    components: list[MixedComponent] = Field(
        default_factory=_default_mixed_components, min_length=1
    )

    @model_validator(mode="after")
    def check_consistent_dims(self) -> Self:
        # Components are concatenated into one embedding matrix, so every
        # component generator must agree on the embedding dimension.
        dims = {component.generator.params.dim for component in self.components}
        if len(dims) > 1:
            raise ValueError(
                f"mixed components must share one embedding dim, got {sorted(dims)}"
            )
        return self


class MixedGenerator(AbstractGenerator[MixedParams]):
    shape: Literal["mixed"] = "mixed"
    params: MixedParams = Field(default_factory=MixedParams)

    def run(self, seed: int) -> Dataset:
        rng = np.random.default_rng(seed)
        n = self.n
        components = self.params.components

        total_weight = sum(component.weight for component in components)
        sizes = [int(component.weight / total_weight * n) for component in components]
        for i in range(n - sum(sizes)):  # distribute rounding remainder
            sizes[i % len(sizes)] += 1

        if any(size < 1 for size in sizes):
            raise ValueError(
                f"n={n} is too small for {len(components)} weighted components"
            )

        embedding_parts: list[np.ndarray] = []
        edge_parts: list[np.ndarray] = []
        label_parts: list[np.ndarray] = []
        component_truth: list[JsonValue] = []
        node_offset = 0
        label_offset = 0

        for component, size in zip(components, sizes):
            child_seed = int(rng.integers(0, 2**31 - 1))
            child = component.generator.model_copy(update={"n": size})
            child_dataset = child.run(child_seed)

            embedding_parts.append(child_dataset.embeddings)
            edge_parts.append(child_dataset.edges + node_offset)

            child_labels = child_dataset.labels.copy()
            labeled = child_labels >= 0

            child_labels[labeled] += label_offset
            label_parts.append(child_labels)

            component_truth.append(
                {
                    "shape": child.shape,
                    "n": size,
                    "node_offset": node_offset,
                    "label_offset": label_offset,
                    "seed": child_seed,
                }
            )

            if labeled.any():
                label_offset = int(child_labels[labeled].max()) + 1

            node_offset += size

        truth: JsonDict = {
            "components": component_truth,
            "labels_are": "per-component, offset",
        }

        return Dataset(
            "mixed",
            np.concatenate(embedding_parts),
            _canonical_edges(np.concatenate(edge_parts)),
            np.concatenate(label_parts),
            truth,
            self.config(),
            seed,
        )


type Generator = Annotated[
    LeafGenerator | MixedGenerator,
    Field(discriminator="shape"),
]
"""Discriminated union over all shapes: this IS the dispatch. Suite YAML
entries (``{shape, n, params}``) validate directly into generator
instances; call ``.run(seed)`` on the result."""

generator_adapter: TypeAdapter[Generator] = TypeAdapter(Generator)
"""Validator for the string/JSON boundary (CLI, YAML)."""


def _union_members(annotation: object) -> Iterator[type[BaseModel]]:
    """Concrete generator classes of a (possibly nested/aliased) union."""
    if isinstance(annotation, TypeAliasType):
        yield from _union_members(annotation.__value__)
    elif get_args(annotation):
        for argument in get_args(annotation):
            if isinstance(argument, FieldInfo):
                continue  # the Annotated discriminator metadata

            yield from _union_members(argument)
    else:
        assert isinstance(annotation, type)
        assert issubclass(annotation, AbstractGenerator)

        yield annotation


def generator_shapes() -> tuple[str, ...]:
    """Shape names, derived from the union (there is no registry)."""
    return tuple(
        sorted(
            member.model_fields["shape"].default for member in _union_members(Generator)
        )
    )
