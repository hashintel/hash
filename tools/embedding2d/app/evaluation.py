"""
Does densMAP actually improve the layout? A controlled A/B harness.

The question is not "is densMAP better" in the abstract -- it is a trade.
densMAP augments UMAP's objective with a density-preservation term: it
tries to make regions that are dense in the *source* look dense in 2D.
Its promised win is density fidelity; its usual costs are neighbourhood
fidelity, runtime, and -- specific to this tool -- how cleanly the layout
distils into the serving MLP. So the harness fits BOTH layouts on the
*identical* fused graph (same subsample, same alpha, same init, same
seed, single-threaded so the SGD is reproducible) and scores each on four
buckets:

  1. Topology     -- sampled trustworthiness / continuity, kNN recall.
                     What plain UMAP is already good at; the thing densMAP
                     most risks damaging.
  2. Density      -- the decisive test, since it is what densMAP is *for*:
                     correlation of each node's source radius with its 2D
                     radius, plus a graph-structural variant (node strength
                     in the fused graph vs 2D local density).
  3. Global       -- Shepard correlation over random pairs; relation-edge
                     separation AUC (do linked entities land close?).
  4. Cost         -- wall-clock per fit. (Distillation RMSE is a separate,
                     heavier probe; see `--distil`.)

Nothing here touches the database: it reuses a cached `sample.f32` (+
`.metadata.npy` / `.edges.npy`) from a previous `main.py` run. Everything
is computed on a random row subsample so a full sweep runs in minutes.

The verdict is the printed table: densMAP should win bucket 2, roughly
tie or slightly lose bucket 1/3, and cost in bucket 4 -- and it may land
differently at different alpha. Read the deltas, not a single number.
"""

import logging
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, cast

import numpy as np
import scipy.sparse as sp
from sklearn.metrics import roc_auc_score
from sklearn.neighbors import NearestNeighbors

from app.layout import (
    LayoutGraphParams,
    RelationSetParams,
    SemanticSetParams,
    relation_set,
    semantic_set,
)
from app.sample import Sample

logger = logging.getLogger("evaluate")


@dataclass(frozen=True)
class EvalParams:
    alphas: tuple[float, ...] = (1.0, 0.5)
    # Row subsample size. The metrics are O(subsample) in memory (kNN
    # graphs, not dense n x n matrices), so 20k is a comfortable default
    # that still fits a semantic + relation graph worth laying out; drop
    # it for a quick smoke test.
    subsample: int = 20_000
    # Semantic kNN for the *layout* graph (mirrors main.py's --k).
    k: int = 15
    # Neighbourhood size the *metrics* score at. Kept independent of the
    # layout k so topology/density are judged at a scale we choose.
    metric_k: int = 15
    min_dist: float = 0.1
    # Matched across the A/B pair. densMAP applies its density term only
    # over the last `dens_frac` of epochs, so with an equal budget it
    # gets fewer pure-attraction epochs -- a deliberately controlled
    # comparison (same optimizer budget), not densMAP's as-shipped +200.
    n_epochs: int = 200
    # Query points for sampled trustworthiness/continuity (each costs one
    # distance-to-all pass, so this is the main knob on that metric's cost).
    trust_queries: int = 1500
    # Random pairs for the Shepard correlation.
    shepard_pairs: int = 100_000
    # Positive edges (and an equal number of negatives) for the edge AUC.
    edge_samples: int = 50_000
    seed: int = 42
    # Also distil each layout into the serving MLP and report val RMSE.
    # Off by default: it roughly doubles runtime and needs torch.
    distil: bool = False
    distil_epochs: int = 15


@dataclass
class Metrics:
    """One layout's scores. Higher is better for every field except the
    two radii (bookkeeping) and fit_seconds."""

    trustworthiness: float = float("nan")
    continuity: float = float("nan")
    knn_recall: float = float("nan")
    radius_corr: float = float("nan")  # source vs 2D local radius (Spearman)
    graph_density_corr: float = float("nan")  # fused strength vs 2D density
    shepard_pearson: float = float("nan")
    shepard_spearman: float = float("nan")
    edge_auc: float = float("nan")
    distil_rmse: float = float("nan")  # layout units; lower is better
    fit_seconds: float = float("nan")


# ---------------------------------------------------------------------------
# Subsampling
# ---------------------------------------------------------------------------


def take_subsample(
    sample: Sample, size: int, rng: np.random.Generator
) -> tuple[Sample, np.ndarray]:
    """
    A random row subsample as a self-contained `Sample`: embeddings copied
    into RAM (from the memmap), metadata sliced, edges kept iff both
    endpoints survived and remapped to the new row indices.
    """
    n = len(sample.metadata)
    if size >= n:
        emb = np.ascontiguousarray(np.asarray(sample.embeddings))
        return (
            Sample(
                metadata=sample.metadata,
                embeddings=cast(np.memmap, emb),
                edges=sample.edges,
            ),
            np.arange(n),
        )

    sel = np.sort(rng.choice(n, size=size, replace=False))
    remap = np.full(n, -1, dtype=np.int64)
    remap[sel] = np.arange(len(sel))

    emb = np.ascontiguousarray(np.asarray(sample.embeddings)[sel])

    edges = sample.edges
    if len(edges):
        mapped = remap[edges]
        keep = (mapped[:, 0] >= 0) & (mapped[:, 1] >= 0)
        edges = mapped[keep]
    else:
        edges = np.empty((0, 2), dtype=np.int64)

    sub = Sample(
        metadata=sample.metadata[sel],
        embeddings=cast(np.memmap, emb),
        edges=edges,
    )
    logger.info(f"subsample: {len(sel):,} rows, {len(edges):,} intra-sample edges")
    return sub, sel


# ---------------------------------------------------------------------------
# Neighbour bookkeeping (computed once, shared by every metric + layout)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Neighbourhoods:
    """kNN in the source (cosine embeddings), reused across alphas/layouts."""

    indices: np.ndarray  # (n, k) neighbour rows, self excluded
    distances: np.ndarray  # (n, k) cosine distances, self excluded

    @property
    def radius(self) -> np.ndarray:
        # Mean cosine distance to the k nearest neighbours: the source
        # local radius densMAP is trying to reproduce in 2D.
        return self.distances.mean(axis=1)


def source_neighbourhoods(emb: np.ndarray, k: int) -> Neighbourhoods:
    nn = NearestNeighbors(n_neighbors=k + 1, metric="cosine", algorithm="brute")
    nn.fit(emb)
    dist, idx = nn.kneighbors(emb)
    # Column 0 is self (distance 0); drop it.
    return Neighbourhoods(indices=idx[:, 1:], distances=dist[:, 1:])


def layout_neighbourhoods(xy: np.ndarray, k: int) -> Neighbourhoods:
    nn = NearestNeighbors(n_neighbors=k + 1, metric="euclidean")
    nn.fit(xy)
    dist, idx = nn.kneighbors(xy)
    return Neighbourhoods(indices=idx[:, 1:], distances=dist[:, 1:])


# ---------------------------------------------------------------------------
# Correlation (numpy-only: avoids scipy.stats' shifting return types and
# ties spearman to a single, explicit average-rank definition)
# ---------------------------------------------------------------------------


def _rankdata(x: np.ndarray) -> np.ndarray:
    """Average ranks, ties shared (the definition Spearman assumes)."""
    x = np.asarray(x, dtype=np.float64)
    n = x.size
    order = np.argsort(x, kind="stable")
    inv = np.empty(n, dtype=np.int64)
    inv[order] = np.arange(n)
    _uniq, first, counts = np.unique(x[order], return_index=True, return_counts=True)
    group_avg = first + (counts - 1) / 2.0
    ranks_sorted = np.repeat(group_avg, counts)
    return ranks_sorted[inv]


def _pearson(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < 3:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < 3:
        return float("nan")
    return _pearson(_rankdata(a), _rankdata(b))


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def knn_recall(source: Neighbourhoods, layout: Neighbourhoods) -> float:
    """Mean fraction of each point's source kNN that remain in its 2D kNN."""
    hits = 0
    for src_row, lo_row in zip(source.indices, layout.indices):
        hits += np.intersect1d(src_row, lo_row, assume_unique=True).size
    return hits / (source.indices.shape[0] * source.indices.shape[1])


def radius_correlation(source: Neighbourhoods, layout: Neighbourhoods) -> float:
    """
    Spearman of log source radius vs log 2D radius -- densMAP's own
    objective, so it *should* win here; the point is by how much, and
    whether plain UMAP was already fine.
    """
    r_hi = np.log(source.radius + 1e-12)
    r_lo = np.log(layout.radius + 1e-12)
    return _spearman(r_hi, r_lo)


def graph_density_correlation(strength: np.ndarray, layout: Neighbourhoods) -> float:
    """
    Spearman of fused-graph node strength vs 2D local density. Ties
    density to *graph structure* rather than to the embedding: a node
    with more total edge weight sits in a denser part of the graph and
    should sit in a denser part of the map (smaller 2D radius, hence the
    negation).
    """
    density = -np.log(layout.radius + 1e-12)
    ok = strength > 0
    if ok.sum() < 3:
        return float("nan")
    return _spearman(strength[ok], density[ok])


def shepard_correlation(
    emb: np.ndarray, xy: np.ndarray, pairs: int, rng: np.random.Generator
) -> tuple[float, float]:
    """Pearson + Spearman of source (cosine) vs 2D (Euclidean) distance
    over random pairs -- global-structure preservation."""
    n = len(emb)
    i = rng.integers(0, n, size=pairs)
    j = rng.integers(0, n, size=pairs)
    ok = i != j
    i, j = i[ok], j[ok]

    # Unit-norm embeddings: cosine distance = 1 - dot.
    d_hi = 1.0 - np.einsum("ij,ij->i", emb[i], emb[j])
    d_lo = np.linalg.norm(xy[i] - xy[j], axis=1)
    return _pearson(d_hi, d_lo), _spearman(d_hi, d_lo)


def edge_separation_auc(
    edges: np.ndarray, xy: np.ndarray, samples: int, rng: np.random.Generator
) -> float:
    """
    AUC of {is a relation edge} vs 2D proximity: for a matched set of real
    edges and random non-edges, can 2D distance alone tell them apart?
    Directly a "graph structure" score -- 0.5 is chance, 1.0 is perfect.
    """
    edges = edges[edges[:, 0] != edges[:, 1]]
    if len(edges) < 10:
        return float("nan")

    if len(edges) > samples:
        edges = edges[rng.choice(len(edges), size=samples, replace=False)]

    n = len(xy)
    neg_i = rng.integers(0, n, size=len(edges))
    neg_j = rng.integers(0, n, size=len(edges))

    pos_d = np.linalg.norm(xy[edges[:, 0]] - xy[edges[:, 1]], axis=1)
    neg_d = np.linalg.norm(xy[neg_i] - xy[neg_j], axis=1)

    labels = np.concatenate([np.ones(len(pos_d)), np.zeros(len(neg_d))])
    # Closer should mean "edge", so score on negated distance.
    scores = -np.concatenate([pos_d, neg_d])
    return float(roc_auc_score(labels, scores))


def sampled_trust_continuity(
    emb: np.ndarray,
    xy: np.ndarray,
    k: int,
    queries: int,
    rng: np.random.Generator,
) -> tuple[float, float]:
    """
    Trustworthiness and continuity, estimated over a query subset so no
    dense n x n matrix is ever formed.

    Trustworthiness penalizes *false* neighbours (close in 2D, far in
    source), continuity penalizes *missed* ones (close in source, far in
    2D), each weighted by how far off the rank is. Both in [0, 1]; 1 is
    perfect. Standard formula (Venna & Kaski), averaged over the queries.
    """
    n = len(emb)
    queries = min(queries, n)
    qs = rng.choice(n, size=queries, replace=False)

    trust_penalty = 0.0
    cont_penalty = 0.0

    for i in qs:
        d_hi = 1.0 - emb @ emb[i]
        d_lo = np.linalg.norm(xy - xy[i], axis=1)

        order_hi = np.argsort(d_hi, kind="stable")
        order_lo = np.argsort(d_lo, kind="stable")

        rank_hi = np.empty(n, dtype=np.int64)
        rank_hi[order_hi] = np.arange(n)
        rank_lo = np.empty(n, dtype=np.int64)
        rank_lo[order_lo] = np.arange(n)

        knn_hi = order_hi[1 : k + 1]  # self is at 0
        knn_lo = order_lo[1 : k + 1]

        # False neighbours: in the 2D kNN but not the source kNN, charged
        # their source rank beyond k.
        for j in knn_lo:
            if rank_hi[j] > k:
                trust_penalty += rank_hi[j] - k
        # Missed neighbours: in the source kNN but not the 2D kNN, charged
        # their 2D rank beyond k.
        for j in knn_hi:
            if rank_lo[j] > k:
                cont_penalty += rank_lo[j] - k

    norm = 2.0 / (queries * k * (2 * n - 3 * k - 1))
    return float(1.0 - norm * trust_penalty), float(1.0 - norm * cont_penalty)


def community_separation(
    fused: sp.coo_matrix, xy: np.ndarray, rng: np.random.Generator
) -> float | None:
    """
    Optional: run Leiden on the fused graph, then silhouette those
    communities in 2D. Answers "do graph-native communities stay visually
    separated?". Returns None (with a hint) if igraph/leidenalg are absent
    so the harness never hard-depends on them.
    """
    try:
        import igraph as ig  # type: ignore
        import leidenalg  # type: ignore
    except ImportError:
        logger.info(
            "community separation skipped: `uv add leidenalg python-igraph` to enable"
        )
        return None

    from sklearn.metrics import silhouette_score

    upper = sp.triu(fused, k=1).tocoo()
    if upper.nnz == 0:
        return None

    shape = fused.shape
    assert shape is not None

    graph = ig.Graph(
        n=shape[0],
        edges=list(zip(upper.row.tolist(), upper.col.tolist())),
        edge_attrs={"weight": upper.data.tolist()},
    )
    part = leidenalg.find_partition(
        graph,
        leidenalg.ModularityVertexPartition,
        weights="weight",
        seed=int(rng.integers(2**31)),
    )
    labels = np.asarray(part.membership)

    # Silhouette needs >= 2 communities; drop singletons and subsample.
    counts = np.bincount(labels)
    big = np.nonzero(counts >= 10)[0]
    keep = np.isin(labels, big)
    if np.unique(labels[keep]).size < 2:
        return None

    idx = np.nonzero(keep)[0]
    if idx.size > 10_000:
        idx = rng.choice(idx, size=10_000, replace=False)
    return float(silhouette_score(xy[idx], labels[idx]))


# ---------------------------------------------------------------------------
# Fit + score one layout
# ---------------------------------------------------------------------------


def score_layout(
    *,
    xy: np.ndarray,
    emb: np.ndarray,
    source: Neighbourhoods,
    strength: np.ndarray,
    edges: np.ndarray,
    params: EvalParams,
    rng: np.random.Generator,
) -> tuple[Metrics, Neighbourhoods]:
    """Score one layout; also return its 2D neighbourhoods so the caller
    can reuse the radii (for the density scatter) without rebuilding."""
    layout = layout_neighbourhoods(xy, params.metric_k)
    trust, cont = sampled_trust_continuity(
        emb, xy, params.metric_k, params.trust_queries, rng
    )
    shep_p, shep_s = shepard_correlation(emb, xy, params.shepard_pairs, rng)

    metrics = Metrics(
        trustworthiness=trust,
        continuity=cont,
        knn_recall=knn_recall(source, layout),
        radius_corr=radius_correlation(source, layout),
        graph_density_corr=graph_density_correlation(strength, layout),
        shepard_pearson=shep_p,
        shepard_spearman=shep_s,
        edge_auc=edge_separation_auc(edges, xy, params.edge_samples, rng),
    )
    return metrics, layout


def distil_rmse(
    emb: np.ndarray,
    edges: np.ndarray,
    xy: np.ndarray,
    hubs: np.ndarray,
    epochs: int,
    seed: int,
) -> float:
    """Val RMSE (layout units) of the serving MLP fit to this layout --
    the downstream cost that partly cancels any visual gain."""
    from app.features import StructureFeatureParams, structure_features
    from app.mlp import MLP

    xs, _deg_norm = structure_features(
        emb, edges, params=StructureFeatureParams(), exclude=hubs
    )
    center = xy.mean(axis=0)
    scale = xy.std(axis=0)
    np.maximum(scale, 1e-6, out=scale)
    ys = ((xy - center) / scale).astype(np.float32)

    network = MLP(input_dim=xs.shape[1])
    val_rmse = network.fit(xs=xs, ys=ys, epochs=epochs, seed=seed)
    return val_rmse * float(scale.mean())


# ---------------------------------------------------------------------------
# Density scatter
# ---------------------------------------------------------------------------


def plot_radius_scatter(
    *,
    source_radius: np.ndarray,
    radii: dict[str, np.ndarray],
    corrs: dict[str, float],
    alpha: float,
    out_path: Path,
) -> None:
    """
    The density claim, made visual. x is each node's source local radius
    (fixed across both panels); y is its 2D local radius under UMAP vs
    densMAP. densMAP is doing its job when the cloud is a tighter, more
    monotone band -- i.e. source-dense nodes stay 2D-dense -- which the
    annotated Spearman also reports.
    """
    import matplotlib  # type: ignore

    matplotlib.use("Agg")  # headless: write a file, never open a window
    import matplotlib.pyplot as plt  # type: ignore

    x = np.log10(source_radius + 1e-12)
    fig, axes = plt.subplots(1, 2, figsize=(11, 5), sharex=True, sharey=True)

    last = None
    for ax, name in zip(axes, ("umap", "densmap")):
        y = np.log10(radii[name] + 1e-12)
        last = ax.hexbin(x, y, gridsize=60, bins="log", cmap="viridis", mincnt=1)
        ax.set_title(f"{name}   (Spearman {corrs[name]:+.3f})")
        ax.set_xlabel("log₁₀ source radius (cosine kNN mean)")
    axes[0].set_ylabel("log₁₀ 2D radius (euclidean kNN mean)")

    fig.suptitle(
        f"α = {alpha:.2f}: source vs 2D local radius — "
        "densMAP wins if its band is tighter / more monotone"
    )
    if last is not None:
        fig.colorbar(last, ax=list(axes), label="points per cell (log)")
    fig.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


@dataclass
class AlphaResult:
    alpha: float
    umap: Metrics
    densmap: Metrics
    community_umap: float | None = None
    community_densmap: float | None = None


def evaluate(
    *,
    sample: Sample,
    params: EvalParams = EvalParams(),
    semantic_params: SemanticSetParams | None = None,
    relation_params: RelationSetParams = RelationSetParams(),
    plot_dir: Path | None = None,
) -> list[AlphaResult]:
    """
    Run the A/B over every alpha and return per-alpha metric pairs. When
    `plot_dir` is given, also write a source-vs-2D radius scatter per
    alpha (`densmap-eval-radius-a{tag}.png`).
    """
    rng = np.random.default_rng(params.seed)
    semantic_params = semantic_params or SemanticSetParams(k=params.k)

    sub, _sel = take_subsample(sample, params.subsample, rng)
    emb = np.asarray(sub.embeddings)

    logger.info("building semantic + relation graphs on the subsample")
    s = semantic_set(sample=sub, params=semantic_params, rng=rng)
    r = relation_set(sample=sub, params=relation_params)

    logger.info(f"source neighbourhoods (k={params.metric_k})")
    source = source_neighbourhoods(emb, params.metric_k)

    results: list[AlphaResult] = []
    for alpha in params.alphas:
        fused = s.fuse(r, alpha=alpha)
        strength = np.asarray(fused.graph.tocsr().sum(axis=1)).ravel()

        pair: dict[str, Metrics] = {}
        xys: dict[str, np.ndarray] = {}
        radii: dict[str, np.ndarray] = {}
        for name, densmap in (("umap", False), ("densmap", True)):
            logger.info(f"alpha={alpha:.2f} fitting {name}")
            # A fresh Generator seeded identically per side so the two
            # fits draw the same RandomState; identical PCA init (it is a
            # function of `emb`, shared); single-threaded for determinism.
            fit_rng = np.random.default_rng(params.seed)
            start = time.perf_counter()
            xy = fused.embed(
                xs=emb,
                params=LayoutGraphParams(
                    min_dist=params.min_dist,
                    n_epochs=params.n_epochs,
                    init="pca",
                    parallel=False,
                    densmap=densmap,
                ),
                rng=fit_rng,
            )
            elapsed = time.perf_counter() - start

            metrics, layout = score_layout(
                xy=xy,
                emb=emb,
                source=source,
                strength=strength,
                edges=sub.edges,
                params=params,
                rng=np.random.default_rng(params.seed),
            )
            metrics.fit_seconds = elapsed

            if params.distil:
                logger.info(f"alpha={alpha:.2f} distilling {name}")
                metrics.distil_rmse = distil_rmse(
                    emb,
                    sub.edges,
                    xy,
                    r.hubs,
                    params.distil_epochs,
                    seed=int(rng.integers(2**32)),
                )

            pair[name] = metrics
            xys[name] = xy
            radii[name] = layout.radius

        if plot_dir is not None:
            out = plot_dir / f"densmap-eval-radius-a{round(alpha * 100):03d}.png"
            plot_radius_scatter(
                source_radius=source.radius,
                radii=radii,
                corrs={
                    "umap": pair["umap"].radius_corr,
                    "densmap": pair["densmap"].radius_corr,
                },
                alpha=alpha,
                out_path=out,
            )
            logger.info(f"wrote {out}")

        comm_u = community_separation(
            fused.graph.tocoo(), xys["umap"], np.random.default_rng(params.seed)
        )
        comm_d = community_separation(
            fused.graph.tocoo(), xys["densmap"], np.random.default_rng(params.seed)
        )

        results.append(
            AlphaResult(
                alpha=alpha,
                umap=pair["umap"],
                densmap=pair["densmap"],
                community_umap=comm_u,
                community_densmap=comm_d,
            )
        )

    return results


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

# (label, attribute, higher_is_better)
_ROWS: tuple[tuple[str, str, bool], ...] = (
    ("trustworthiness", "trustworthiness", True),
    ("continuity", "continuity", True),
    ("knn recall", "knn_recall", True),
    ("radius corr (density)", "radius_corr", True),
    ("graph density corr", "graph_density_corr", True),
    ("shepard pearson", "shepard_pearson", True),
    ("shepard spearman", "shepard_spearman", True),
    ("edge AUC", "edge_auc", True),
    ("distil RMSE (units)", "distil_rmse", False),
    ("fit seconds", "fit_seconds", False),
)


def format_table(result: AlphaResult) -> str:
    lines = [
        f"alpha = {result.alpha:.2f}   (UMAP vs densMAP; ✓ = densMAP wins)",
        f"  {'metric':<24}{'umap':>12}{'densmap':>12}{'delta':>12}  ",
    ]
    for label, attr, higher_better in _ROWS:
        u = getattr(result.umap, attr)
        d = getattr(result.densmap, attr)
        if np.isnan(u) and np.isnan(d):
            continue
        delta = d - u
        better = (delta > 0) if higher_better else (delta < 0)
        mark = "✓" if better else " "
        lines.append(f"  {label:<24}{u:>12.4f}{d:>12.4f}{delta:>+12.4f} {mark}")

    if result.community_umap is not None and result.community_densmap is not None:
        cu, cd = result.community_umap, result.community_densmap
        mark = "✓" if cd > cu else " "
        lines.append(
            f"  {'community silhouette':<24}{cu:>12.4f}{cd:>12.4f}{cd - cu:>+12.4f} {mark}"
        )

    return "\n".join(lines)


def _finite(metrics: Metrics) -> dict[str, Any]:
    # NaN is not valid JSON; emit null so strict parsers (and the browser)
    # can read the artifact. NaN here means "not applicable" (e.g. edge
    # AUC when the subsample had too few edges), which null conveys.
    return {
        key: (None if isinstance(value, float) and np.isnan(value) else value)
        for key, value in asdict(metrics).items()
    }


def results_to_dict(results: list[AlphaResult], params: EvalParams) -> dict[str, Any]:
    return {
        "params": asdict(params),
        "results": [
            {
                "alpha": rc.alpha,
                "umap": _finite(rc.umap),
                "densmap": _finite(rc.densmap),
                "community_umap": rc.community_umap,
                "community_densmap": rc.community_densmap,
            }
            for rc in results
        ],
    }
