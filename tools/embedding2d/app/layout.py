import logging
import os
from dataclasses import dataclass
from typing import Literal, Self, cast

import hnswlib
import numpy as np
import scipy.sparse as sp
from tqdm import tqdm
from umap.umap_ import find_ab_params, fuzzy_simplicial_set, simplicial_set_embedding

from app.sample import Sample


@dataclass(frozen=True)
class LayoutGraphParams:
    # Purely visual: the tightest spacing the layout allows between
    # points. Smaller (0.01-0.05) packs clusters dense and shows fine
    # structure; larger (0.3+) reads airier. umap's default is 0.1.
    min_dist: float
    # umap's auto-default: 500 below 10k points, 200 above. Also acts
    # as an edge filter -- edges weaker than graph.max()/n_epochs are
    # pruned before optimization -- so more epochs also means more weak
    # edges surviving. Warm-started refits converge in far fewer
    # (50-100).
    n_epochs: int

    # Fitted together with min_dist into the a/b curve shaping the
    # low-dim attraction kernel; the ratio is what matters. Convention:
    # leave spread at 1.0 and tune min_dist only.
    spread: float = 1.0
    # umap's learning_rate: SGD step size, decayed linearly to 0 over
    # the epochs. Raise only if a short-epoch run looks under-converged;
    # lowering (0.1-0.5) can help warm starts move less.
    sgd_learning_rate: float = 1.0
    # umap's repulsion_strength: weight on negative samples. >1 pushes
    # clusters apart harder (risks shredding manifolds into islands),
    # <1 lets them merge. Rarely worth touching.
    gamma: float = 1.0
    # Negative samples drawn per positive edge per epoch: higher gives
    # crisper separation at linearly more cost. 5 is umap's default;
    # 2-3 is a fair economy at ~1M points.
    negative_sample_rate: int = 5
    # Cold-start placement; an (n, 2) array warm-starts instead (umap
    # jitters exact duplicates so coincident starts can separate).
    init: Literal["pca", "random", "spectral", "tswspectral"] | np.ndarray = "pca"


@dataclass(frozen=True)
class LayoutGraph:
    """A weighted graph over sample rows: symmetric COO, weights in [0, 1]."""

    graph: sp.coo_matrix

    def embed(
        self, *, xs: np.ndarray, params: LayoutGraphParams, rng: np.random.Generator
    ) -> np.ndarray:
        a, b = find_ab_params(spread=params.spread, min_dist=params.min_dist)
        xy, _aux = simplicial_set_embedding(
            data=xs,
            # simplicial_set_embedding prunes weak edges *in place* (and
            # coo.tocoo() returns self, not a copy), which would corrupt
            # this graph for any later embed at different params.
            graph=self.graph.copy(),
            n_components=2,
            initial_alpha=params.sgd_learning_rate,
            a=a,
            b=b,
            gamma=params.gamma,
            negative_sample_rate=params.negative_sample_rate,
            n_epochs=params.n_epochs,
            init=params.init,
            # Needs RandomState API (.randint/.uniform); a Generator
            # would crash. Seeding it from rng keeps one seed source.
            random_state=np.random.RandomState(int(rng.integers(2**32))),
            # Only used to place disconnected components relative to
            # each other (via distances in `data`); cosine matches the
            # unit-norm embeddings.
            metric="cosine",
            metric_kwds={},
            densmap=False,
            densmap_kwds={},
            output_dens=False,
            # Parallel SGD is non-deterministic even when seeded; warm
            # starts bound the run-to-run drift we actually care about.
            parallel=True,
            verbose=True,
        )

        return xy.astype(np.float32)

    def fuse(self, other: Self, *, alpha: float) -> Self:
        """
        Convex blend of the two graphs: F = alpha*self + (1-alpha)*other
        -- call as `semantic.fuse(relation, alpha=...)`, in that order.

        `alpha` slides between worldviews: 1.0 is the purely semantic
        layout, 0.0 the purely relational one. Uniform scale cancels in
        UMAP's optimizer (edge weights are normalized by graph.max() when
        converted to epochs-per-sample), so what the blend really sets is
        the ratio alpha/(1-alpha) between semantic and relation edges.

        Caveat at low alpha: entities with no relations keep only their
        down-weighted semantic edges and drift toward the periphery --
        honest, but worth knowing when reading those layouts.
        """
        fused = (
            alpha * self.graph.tocsr() + (1.0 - alpha) * other.graph.tocsr()
        ).tocoo()

        # At the alpha endpoints one side is multiplied to explicit zeros;
        # drop them rather than carrying dead entries through the layout.
        fused.eliminate_zeros()

        return self.__class__(graph=fused)


@dataclass(frozen=True)
class SemanticSetParams:
    """HNSW knobs; see `knn_graph` for what each trades off."""

    k: int = 15
    ef_construction: int = 200
    M: int = 16


def semantic_set(
    *, sample: Sample, params: SemanticSetParams, rng: np.random.Generator
) -> LayoutGraph:
    xs = sample.embeddings
    n, dim = xs.shape
    k = params.k

    # hnswlib indexes are fixed-capacity: the element count must be
    # declared up front via init_index (resizing later is possible but
    # not free).
    index = hnswlib.Index(space="cosine", dim=dim)
    index.init_index(
        max_elements=n,
        ef_construction=params.ef_construction,
        M=params.M,
        random_seed=int(rng.integers(2**32)),
    )

    # Unusual usage: normally an HNSW index is a long-lived search
    # structure, but here it's built only to extract each point's k
    # nearest neighbours for UMAP, then thrown away.
    #
    # add_items/knn_query are chunked purely so tqdm has something to
    # report between calls -- these are by far the longest silent
    # stretches of a run. Each chunk still fans out across all threads,
    # so the overhead is negligible.
    threads = os.cpu_count() or 1
    chunk = 100_000

    with tqdm(total=n, desc="building hnsw index", unit="pt", unit_scale=True) as bar:
        for start in range(0, n, chunk):
            stop = min(start + chunk, n)
            index.add_items(xs[start:stop], np.arange(start, stop), num_threads=threads)
            bar.update(stop - start)

    # ef is the query-time candidate-list size; 2k with a floor of 64
    # buys high recall cheaply since we only query once.
    index.set_ef(max(64, 2 * k))

    indices = np.empty((n, k), dtype=np.int64)
    distances = np.empty((n, k), dtype=np.float32)
    with tqdm(total=n, desc="querying knn", unit="pt", unit_scale=True) as bar:
        for start in range(0, n, chunk):
            stop = min(start + chunk, n)
            idx_chunk, dist_chunk = index.knn_query(
                xs[start:stop], k=k, num_threads=threads
            )
            indices[start:stop] = idx_chunk.astype(np.int64)
            distances[start:stop] = dist_chunk.astype(np.float32)
            bar.update(stop - start)

    # Float error can make cosine distance slightly negative for
    # (near-)identical vectors; clamp so downstream sqrt/log are safe.
    np.maximum(distances, 0.0, out=distances)

    # UMAP wants each point as its own first neighbour. Querying the
    # index with its own elements usually returns self at position 0,
    # but exact duplicates tie at distance 0 and can displace self
    # further down the list -- or out of it entirely (and, being
    # approximate, HNSW can in principle miss self too). Fix up those
    # rows; sortedness is preserved because every entry ahead of self is
    # a zero-distance tie.
    bad = np.nonzero(indices[:, 0] != np.arange(n))[0]
    for row in bad:
        row_idx, row_dist = indices[row], distances[row]
        pos = np.nonzero(row_idx == row)[0]

        if pos.size:  # self is present, but not first: swap to front
            p = pos[0]
            row_idx[0], row_idx[p] = row_idx[p], row_idx[0]
            row_dist[0], row_dist[p] = row_dist[p], row_dist[0]
        else:  # self missing: prepend and drop the farthest
            indices[row] = np.concatenate([[row], row_idx[:-1]])
            distances[row] = np.concatenate([[0.0], row_dist[:-1]])

    if bad.size:
        logging.info(f"Swapped {bad.size} points to fix knn self-neighbour issue")

    # hnswlib computes even the self-distance in float32, which leaves
    # ~1e-7 residue; pin it to exactly 0 now that self is always first.
    distances[:, 0] = 0.0

    # random_state is only consulted when umap has to compute the knn
    # itself; with precomputed knn this is deterministic. An int keeps
    # sklearn's check_random_state happy (it rejects np.random.Generator).
    (graph, *_) = fuzzy_simplicial_set(
        X=xs,
        n_neighbors=k,
        random_state=int(rng.integers(2**32)),
        metric="cosine",
        knn_indices=indices,
        knn_dists=distances,
    )

    graph = cast(sp.coo_matrix, graph)
    return LayoutGraph(graph=graph.tocoo())


@dataclass(frozen=True)
class RelationSet(LayoutGraph):
    """
    Relation graph plus the hub rows trimmed out of it. The hubs are
    the frozen exclude set that the structure features must mirror and
    serving must reuse as-is (see `app.features`).
    """

    hubs: np.ndarray


@dataclass(frozen=True)
class RelationSetParams:
    # A node is trimmed as a hub only if its degree clears *both* bars:
    # above this quantile of the (positive) degree distribution...
    hub_quantile: float = 0.9995
    # ...and at least this many times the median degree. The quantile
    # alone would always trim the top slice, even of a tight
    # distribution where the "hubs" are ordinary (degree 33 among
    # degree-32 peers); the median ratio makes hubness mean "an outlier
    # in absolute terms", not merely "the largest".
    hub_min_ratio: float = 4.0


def relation_set(*, sample: Sample, params: RelationSetParams) -> RelationSet:
    """
    Symmetrized, degree-normalized, hub-trimmed relation graph in [0, 1].

    Built from `sample.edges` -- (source, target) rows into the sample,
    direction ignored. Hubs -- nodes whose degree dwarfs the rest, e.g.
    an org entity linked from everything -- are cut out entirely: their
    edges say "popular", not "similar", and a single hub would otherwise
    fold its whole neighbourhood into one clump. Degree normalization
    (D^-1/2 A D^-1/2) softens the same effect below the trim threshold:
    an edge between two well-connected nodes counts for less than one
    between two sparsely connected ones.
    """
    n = len(sample.metadata)
    hubs = np.empty(0, dtype=np.int64)

    if len(sample.edges) == 0:
        return RelationSet(graph=sp.coo_matrix((n, n), dtype=np.float32), hubs=hubs)

    edges = np.asarray(sample.edges, dtype=np.int64)
    src, dst = edges[:, 0], edges[:, 1]
    keep = src != dst  # self-loops carry no layout information
    src, dst = src[keep], dst[keep]

    # Edge list -> adjacency matrix: entry (i, j) = 1 if an edge exists.
    # tocsr() sums duplicate (src, dst) pairs, so parallel edges surface
    # as weights > 1 here; the element-wise max with the transpose then
    # makes the graph undirected (edge in either direction counts).
    adjacency = sp.coo_matrix(
        (np.ones(len(src), dtype=np.float32), (src, dst)), shape=(n, n)
    ).tocsr()
    adjacency = adjacency.maximum(adjacency.T)  # symmetrize
    adjacency.data[:] = 1.0  # multiplicity is not signal here; drop it

    # With all weights 1, row sums are node degrees.
    degree = np.asarray(adjacency.sum(axis=1)).ravel()
    positive = degree[degree > 0]

    if params.hub_quantile < 1.0 and positive.size:
        cut = max(
            float(np.quantile(positive, params.hub_quantile)),
            params.hub_min_ratio * float(np.median(positive)),
        )
        hubs = np.nonzero(degree > cut)[0]

        if hubs.size:
            logging.info(
                f"relation graph: trimming edges of {hubs.size} hubs "
                f"(degree > {cut:.0f})"
            )

            # Sandwiching between 0/1 diagonal matrices zeroes every
            # row *and* column belonging to a hub, i.e. removes all its
            # edges while keeping the matrix shape; degrees of its
            # former neighbours shrink, so recompute.
            mask = np.ones(n, dtype=bool)
            mask[hubs] = False
            keep_diag = sp.diags(mask.astype(np.float32))
            adjacency = keep_diag @ adjacency @ keep_diag
            degree = np.asarray(adjacency.sum(axis=1)).ravel()

    # Degree-normalize: D^-1/2 A D^-1/2 turns each edge weight into
    # 1/sqrt(deg_i * deg_j), so an edge between two sparsely connected
    # nodes outweighs one between two well-connected ones. Isolated
    # nodes (degree 0, e.g. trimmed hubs) get factor 0 instead of inf.
    with np.errstate(divide="ignore"):
        inv_sqrt = np.where(degree > 0, 1.0 / np.sqrt(np.maximum(degree, 1e-12)), 0.0)
    d_inv = sp.diags(inv_sqrt.astype(np.float32))

    relation = (d_inv @ adjacency @ d_inv).tocoo()
    if relation.nnz:
        relation.data /= relation.data.max()  # same (0, 1] scale as the semantic set

    return RelationSet(graph=relation, hubs=hubs)
