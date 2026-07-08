import logging
import os
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from string.templatelib import Template
from typing import Literal, Self

import hnswlib
import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from tqdm import tqdm
from umap import UMAP

from app.mlp import MLP

TRUNCATED_DIM = 512
SAMPLE_SIZE = 1_500_000
SAMPLE_SEED = 42
FETCH_BATCH_SIZE = 10_000

# TABLESAMPLE is applied *before* the WHERE clause, so the sampling
# percentage must be based on the number of rows matching the filter,
# not the table's total size. Postgres also disallows subqueries in the
# TABLESAMPLE argument, so the percentage is computed here instead.
COUNT_QUERY = """
    SELECT COUNT(*)
    FROM entity_embeddings
    WHERE property IS NULL
"""


@dataclass(frozen=True)
class SampleParams:
    """Knobs for the DB subsample (see `sample_query`)."""

    dim: int = TRUNCATED_DIM
    size: int = SAMPLE_SIZE
    fetch_batch_size: int = FETCH_BATCH_SIZE


@dataclass(frozen=True)
class KnnParams:
    """HNSW knobs; see `knn_graph` for what each trades off."""

    k: int = 15
    ef_construction: int = 200
    M: int = 16


@dataclass(frozen=True)
class UmapParams:
    n_neighbors: int = 15
    min_dist: float = 0.1
    # None lets umap-learn pick (500 for small data, 200 for large).
    n_epochs: int | None = None
    # Cold-start initialization; ignored when warm-starting from a
    # previous layout. "pca" over umap's default "spectral": at ~1M
    # points spectral is an unindicated multi-minute-to-hours ARPACK
    # solve on one core, while pca is seconds for near-par quality.
    # "tswspectral" (shift-invert + warm start) is the middle ground.
    init: Literal["pca", "spectral", "tswspectral", "random"] = "pca"


@dataclass(frozen=True)
class MlpParams:
    """Training knobs for distilling the layout into an MLP encoder."""

    epochs: int = 30
    batch_size: int = 8192
    lr: float = 1e-3
    lr_min: float = 1e-4
    val_frac: float = 0.02
    patience: int = 5


@dataclass(frozen=True)
class Sample:
    """
    A subsample of entity embeddings.

    `ids` are `web_id~entity_uuid` byte strings (HASH's canonical entity
    id format), aligned row-for-row with `embeddings`: (n, dim) float32,
    unit-norm, memmapped from disk.
    """

    ids: np.ndarray
    embeddings: np.memmap


@dataclass(frozen=True)
class KnnGraph:
    """
    kNN graph in UMAP's `precomputed_knn` shape: `indices` (int64) and
    `distances` (float32) are both (n, k), rows sorted by distance, and
    every point is its own first neighbour at distance exactly 0.
    """

    indices: np.ndarray
    distances: np.ndarray


@dataclass(frozen=True)
class Layout:
    """
    A fitted 2D layout: `xy` is (n, 2) float32, aligned with `ids`.
    This is what `fit` persists and what the next run warm-starts from.
    """

    ids: np.ndarray
    xy: np.ndarray

    def save(self, path: Path) -> None:
        np.savez_compressed(path, ids=self.ids, xy=self.xy)

    @classmethod
    def load(cls, path: Path) -> Self:
        with np.load(path) as data:
            return cls(ids=data["ids"], xy=data["xy"])


def sample_query(matching_rows: int, *, params: SampleParams, seed: int) -> Template:
    # Deliberately no LIMIT: BERNOULLI emits rows in heap (~insertion)
    # order, so capping an oversampled scan would keep the head of the
    # table and systematically drop the most recently inserted entities
    # -- the very rows a refit exists to pick up. Instead the percentage
    # targets `params.size` exactly and the row count is left to jitter
    # around it (binomial: ~0.1% relative at 1M rows). Nothing
    # downstream assumes an exact count.
    pct = min(100.0, 100.0 * params.size / max(matching_rows, 1))

    # The Matryoshka prefix is not unit-norm on its own; renormalize so
    # cosine/dot are meaningful on the truncated vectors.
    #
    # `dim` is spliced as a literal (`:l`) rather than bound as a
    # parameter: type modifiers (`::vector(n)`) must be simple
    # constants.
    return t"""
        SELECT
            e.entity_uuid,
            e.web_id,
            l2_normalize(
                subvector(e.embedding, 1, {params.dim:l})
            )::vector({params.dim:l}) AS embedding
        FROM entity_embeddings e
        TABLESAMPLE BERNOULLI ({pct}) REPEATABLE ({seed})
        WHERE e.property IS NULL
    """


def connect() -> psycopg.Connection:
    return psycopg.connect(
        host=os.environ.get("HASH_GRAPH_PG_HOST", "localhost"),
        port=int(os.environ.get("HASH_GRAPH_PG_PORT", "5432")),
        user=os.environ.get("HASH_GRAPH_PG_USER", "graph"),
        password=os.environ.get("HASH_GRAPH_PG_PASSWORD", "graph"),
        dbname=os.environ.get("HASH_GRAPH_PG_DATABASE", "graph"),
    )


def ids_path_for(embeddings_path: Path) -> Path:
    """Sidecar file holding the entity ids for an embeddings file."""
    return embeddings_path.with_name(embeddings_path.name + ".ids.npy")


def fetch_sample(out_path: Path, *, params: SampleParams, seed: int) -> int:
    """
    Stream sampled embeddings into `out_path` as raw little-endian
    float32 rows of `params.dim` values each, and their entity ids into
    the `ids_path_for(out_path)` sidecar. Returns the row count.
    """

    rows_written = 0
    id_chunks: list[np.ndarray] = []

    with connect() as conn:
        # Makes `vector` columns come back as pgvector `Vector` objects
        # (required for the binary cursor to decode them at all).
        register_vector(conn)

        with conn.cursor() as cursor:
            cursor.execute(COUNT_QUERY)
            row = cursor.fetchone()
            assert row is not None
            (matching_rows,) = row

        with (
            conn.cursor(name="embedding_sample", binary=True) as cursor,
            out_path.open("wb") as out,
            # The row count is binomial around the target, so the bar
            # may finish slightly shy of -- or past -- 100%.
            tqdm(
                total=min(params.size, matching_rows),
                desc="fetching sample",
                unit="row",
                unit_scale=True,
            ) as progress,
        ):
            cursor.itersize = params.fetch_batch_size
            cursor.execute(sample_query(matching_rows, params=params, seed=seed))

            while batch := cursor.fetchmany(params.fetch_batch_size):
                block = np.stack([embedding.to_numpy() for (_, _, embedding) in batch])
                out.write(np.ascontiguousarray(block, dtype=np.float32).tobytes())

                # Fixed-width ASCII, so bytes ("S") keeps the ids compact
                # and directly sortable/searchable with numpy.
                id_chunks.append(
                    np.array(
                        [
                            f"{web_id}~{entity_uuid}"
                            for (entity_uuid, web_id, _) in batch
                        ],
                        dtype="S",
                    )
                )
                rows_written += len(batch)
                progress.update(len(batch))

    ids = np.concatenate(id_chunks) if id_chunks else np.array([], dtype="S1")
    np.save(ids_path_for(out_path), ids)

    return rows_written


def load_sample(
    out_path: Path | None = None, *, params: SampleParams, seed: int
) -> Sample:
    """
    Fetch the sample (unless `out_path` and its ids sidecar already
    exist, in which case they are trusted as-is regardless of `params`
    and `seed`) and return it with the embeddings memmapped.
    """

    if out_path is None:
        fd, name = tempfile.mkstemp(prefix="entity-embeddings-", suffix=".f32")
        os.close(fd)
        out_path = Path(name)
        fetch_sample(out_path, params=params, seed=seed)
    elif not (out_path.exists() and ids_path_for(out_path).exists()):
        fetch_sample(out_path, params=params, seed=seed)

    # The row count jitters around `params.size` (binomial sampling,
    # no LIMIT -- see sample_query), so derive it from the file size.
    rows = out_path.stat().st_size // (params.dim * np.float32().itemsize)
    ids = np.load(ids_path_for(out_path))
    if len(ids) != rows:
        raise ValueError(
            f"sample cache out of sync ({len(ids)} ids vs {rows} embeddings); "
            f"delete {out_path} and {ids_path_for(out_path)} to refetch"
        )

    embeddings = np.memmap(
        out_path, dtype=np.float32, mode="r", shape=(rows, params.dim)
    )
    return Sample(ids=ids, embeddings=embeddings)


def knn_graph(xs: np.ndarray, *, params: KnnParams, seed: int) -> KnnGraph:
    """
    Approximate kNN graph over `xs` via HNSW, shaped for UMAP's
    `precomputed_knn` (see `KnnGraph`). Distances are cosine distances
    (1 - cosine similarity; rows are unit-norm, so this is just
    1 - dot).

    Approximate neighbours are fine for UMAP: its fuzzy graph is robust
    to small recall losses (umap-learn itself defaults to ANN via
    pynndescent for anything non-tiny).

    HNSW tuning knobs, briefly (hnswlib's docs hide these in
    ALGO_PARAMS.md):

    - `M`: max out-degree per node in the graph layers. Higher improves
      recall, costs memory (~M * 8-10 bytes/element) and build time.
      12-48 is the sane range; 16 is a good default for ~1M points.
    - `ef_construction`: candidate-list size while *inserting* elements.
      Higher builds a better graph, linearly slower; diminishing returns
      past a few hundred.
    - `ef` (set below): candidate-list size while *querying*. Must be
      >= k; recall grows with it at the cost of query speed.
    """
    n, d = xs.shape
    k = params.k

    # hnswlib indexes are fixed-capacity: the element count must be
    # declared up front via init_index (resizing later is possible but
    # not free).
    index = hnswlib.Index(space="cosine", dim=d)
    index.init_index(
        max_elements=n,
        ef_construction=params.ef_construction,
        M=params.M,
        random_seed=seed,
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

    idx = np.empty((n, k), dtype=np.int64)
    dist = np.empty((n, k), dtype=np.float32)
    with tqdm(total=n, desc="querying knn", unit="pt", unit_scale=True) as bar:
        for start in range(0, n, chunk):
            stop = min(start + chunk, n)
            i, d = index.knn_query(xs[start:stop], k=k, num_threads=threads)
            idx[start:stop] = i.astype(np.int64)
            dist[start:stop] = d.astype(np.float32)
            bar.update(stop - start)

    # Float error can make cosine distance slightly negative for
    # (near-)identical vectors; clamp so downstream sqrt/log are safe.
    np.maximum(dist, 0.0, out=dist)

    # UMAP wants each point as its own first neighbour. Querying the
    # index with its own elements usually returns self at position 0,
    # but exact duplicates tie at distance 0 and can displace self
    # further down the list -- or out of it entirely (and, being
    # approximate, HNSW can in principle miss self too). Fix up those
    # rows; sortedness is preserved because every entry ahead of self is
    # a zero-distance tie.
    bad = np.nonzero(idx[:, 0] != np.arange(n))[0]
    for row in bad:
        row_i, row_d = idx[row], dist[row]
        pos = np.nonzero(row_i == row)[0]

        if pos.size:  # self is present, but not first: swap to front
            p = pos[0]
            row_i[0], row_i[p] = row_i[p], row_i[0]
            row_d[0], row_d[p] = row_d[p], row_d[0]
        else:  # self missing: prepend and drop the farthest
            idx[row] = np.concatenate([[row], row_i[:-1]])
            dist[row] = np.concatenate([[0.0], row_d[:-1]])

    if bad.size:
        logging.info(f"Swapped {bad.size} points to fix knn self-neighbour issue")

    # hnswlib computes even the self-distance in float32, which leaves
    # ~1e-7 residue; pin it to exactly 0 now that self is always first.
    dist[:, 0] = 0.0

    return KnnGraph(indices=idx, distances=dist)


def warm_init(
    previous: Layout,
    *,
    ids: np.ndarray,
    knn_indices: np.ndarray,
    rng: np.random.Generator,
) -> np.ndarray | None:
    """
    Build an (n, 2) UMAP init from a previous run's layout, so that
    successive runs stay visually stable instead of the layout
    reshuffling on every refresh:

    - points that were in the previous layout keep their coordinates;
    - new points start at the mean of their carried-over kNN
      neighbours (their neighbourhood is where UMAP will pull them
      anyway, so this mostly saves epochs and avoids long-range flights
      across the plot);
    - new points with no carried-over neighbour are dropped near the
      centre of the previous layout, with a little jitter so coincident
      starts don't lock together.
    """
    if previous.ids.size == 0:
        return None

    # Membership lookup via binary search: sort the previous ids once,
    # find each current id's would-be position, and check for an exact
    # hit at that position.
    order = np.argsort(previous.ids)
    previous_ids, previous_xy = previous.ids[order], previous.xy[order]

    positions = np.searchsorted(previous_ids, ids)
    # ids sorting past the end would index out of bounds; clamping is
    # safe because the equality check below rejects them anyway.
    positions = np.clip(positions, 0, len(previous_ids) - 1)
    is_old = previous_ids[positions] == ids

    init = np.zeros((len(ids), 2), dtype=np.float32)
    init[is_old] = previous_xy[positions[is_old]]

    new = np.nonzero(~is_old)[0]
    if new.size:
        # Fallback placement is relative to the previous layout as a
        # whole: its centre, jittered proportionally to its spread.
        center = previous_xy.mean(axis=0)
        spread = float(previous_xy.std(axis=0).mean()) or 1.0

        for row in new:
            neighbours = knn_indices[row, 1:]  # position 0 is self
            old_neighbours = neighbours[is_old[neighbours]]
            if old_neighbours.size:
                init[row] = init[old_neighbours].mean(axis=0)
            else:
                init[row] = center + rng.normal(scale=0.05 * spread, size=2)

    logging.info(f"Warm start: {int(is_old.sum())} carried over, {new.size} new")
    return init


def init(
    *,
    rng: np.random.Generator,
    sample: SampleParams = SampleParams(),
    knn: KnnParams = KnnParams(),
    umap: UmapParams = UmapParams(),
    sample_path: Path | None = None,
    previous: Path | None = None,
    out: Path = Path("layout.npz"),
) -> Layout:
    """
    End-to-end: sample embeddings, build the kNN graph, run UMAP
    (warm-started from `previous` if given), and persist the layout to
    `out` -- which is exactly the file a later run can pass as
    `previous`.
    """
    # UMAP silently needs the precomputed knn to be at least
    # n_neighbors wide; fail early instead of deep inside umap-learn.
    if umap.n_neighbors > knn.k:
        raise ValueError(
            f"umap.n_neighbors ({umap.n_neighbors}) must be <= knn.k ({knn.k})"
        )

    data = load_sample(sample_path, params=sample, seed=int(rng.integers(2**32)))
    graph = knn_graph(data.embeddings, params=knn, seed=int(rng.integers(2**32)))

    umap_init: np.ndarray | str = umap.init
    if previous is not None and previous.exists():
        # `umap_init` is an ndarray here, so don't use `or` fallbacks:
        # numpy arrays refuse boolean coercion.
        warm = warm_init(
            Layout.load(previous), ids=data.ids, knn_indices=graph.indices, rng=rng
        )

        if warm is not None:
            umap_init = warm

    reducer = UMAP(
        n_neighbors=umap.n_neighbors,
        n_components=2,
        min_dist=umap.min_dist,
        metric="cosine",
        init=umap_init,
        precomputed_knn=(graph.indices, graph.distances),
        n_epochs=umap.n_epochs,
        # Deliberately unseeded: a fixed random_state forces umap-learn
        # onto its single-threaded deterministic layout path -- hours vs
        # minutes at ~1M points. Sampling, kNN, and the training split
        # stay seeded; the warm start bounds run-to-run layout drift,
        # which is the reproducibility that actually matters here.
        random_state=None,
        verbose=True,
    )
    coords = reducer.fit_transform(data.embeddings).astype(np.float32)

    layout = Layout(ids=data.ids, xy=coords)
    layout.save(out)

    logging.info(f"layout saved: {coords.shape} to {out}")
    return layout


def fit(
    *,
    params: SampleParams,
    seed: int,
    layout: Layout,
    sample: Sample,
    mlp: MlpParams = MlpParams(),
    previous: Path | None = None,
    out: Path = Path("encoder.safetensors"),
    meta: dict[str, str] | None = None,
) -> float:
    """
    Distill the (embedding -> 2D position) mapping into a small MLP, so
    entities outside the fitted sample -- including future ones -- can
    be placed on the same map without re-running UMAP.

    The network trains on standardized coordinates (zero mean, unit
    std per axis), which keeps the regression well-scaled regardless of
    the layout's extent; `MLP.export` folds the de-standardization back
    into the last layer, so the saved encoder maps embeddings straight
    to layout units. Passing the previous encoder as `previous`
    fine-tunes it instead of training from scratch, which both
    converges faster and keeps the mapping drift small between runs.

    Returns the validation RMSE in layout units.
    """
    if len(sample.ids) != len(layout.ids) or (sample.ids != layout.ids).any():
        raise ValueError("layout and sample are not aligned (ids differ)")

    network = MLP(input_dim=params.dim, logger=logging.getLogger())
    if previous is not None and previous.exists():
        network.import_(previous)

    center = layout.xy.mean(axis=0)
    scale = layout.xy.std(axis=0)
    np.maximum(scale, 1e-6, out=scale)
    ys = ((layout.xy - center) / scale).astype(np.float32)

    val_rmse = network.fit(
        xs=sample.embeddings,
        ys=ys,
        epochs=mlp.epochs,
        batch_size=mlp.batch_size,
        lr=mlp.lr,
        lr_min=mlp.lr_min,
        val_frac=mlp.val_frac,
        seed=seed,
        patience=mlp.patience,
    )
    rmse_layout = val_rmse * float(scale.mean())
    logging.info(
        f"distill val RMSE = {rmse_layout:.4f} (layout units; "
        f"layout std = {float(scale.mean()):.3f})"
    )

    network.export(
        out,
        scale=scale,
        center=center,
        meta={
            "dim": str(params.dim),
            "n_points": str(len(sample.ids)),
            "fitted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **(meta or {}),
        },
    )
    logging.info(f"encoder saved to {out}")
    return rmse_layout
