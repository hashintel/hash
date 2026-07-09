import os
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from string.templatelib import Template
from typing import BinaryIO, Self

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from tqdm import tqdm


@dataclass(frozen=True)
class SampleParams:
    """Knobs for the DB subsample (see `query_embeddings`)."""

    dim: int = 512
    size: int = 1_500_000
    fetch_batch_size: int = 10_000


def connect() -> psycopg.Connection:
    return psycopg.connect(
        host=os.environ.get("HASH_GRAPH_PG_HOST", "localhost"),
        port=int(os.environ.get("HASH_GRAPH_PG_PORT", "5432")),
        user=os.environ.get("HASH_GRAPH_PG_USER", "graph"),
        password=os.environ.get("HASH_GRAPH_PG_PASSWORD", "graph"),
        dbname=os.environ.get("HASH_GRAPH_PG_DATABASE", "graph"),
    )


def query_count() -> Template:
    return t"""
        SELECT COUNT(*)
        FROM entity_embeddings
        WHERE property IS NULL
    """


def query_embeddings(
    matching_rows: int, *, params: SampleParams, seed: int
) -> Template:
    # No LIMIT: it would keep only the heap-ordered head of the scan,
    # biasing against recently inserted rows. Binomial jitter is only
    # ~0.1% relative at 1M rows; nothing downstream assumes an exact count.
    pct = min(100.0, 100.0 * params.size / max(matching_rows, 1))

    # The Matryoshka prefix is not unit-norm on its own; renormalize so
    # cosine/dot are meaningful on the truncated vectors.
    # We use literals here for the dimension, because these cannot be parameters per
    # PostgreSQL's SQL syntax.
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


def query_edge_count() -> Template:
    return t"""
        SELECT COUNT(*)
        FROM entity_edge
        WHERE kind = 'has-left-entity' AND direction = 'outgoing'
    """


def query_edges() -> Template:
    # A relation A -> B is stored as a link entity L with two rows in
    # entity_edge: L -> A ('has-left-entity') and L -> B
    # ('has-right-entity'). Self-joining on L yields the (A, B) pairs.
    return t"""
        SELECT
            l.target_entity_uuid,
            l.target_web_id,
            r.target_entity_uuid,
            r.target_web_id
        FROM entity_edge l
        JOIN entity_edge r
            ON l.source_web_id = r.source_web_id
            AND l.source_entity_uuid = r.source_entity_uuid
        WHERE l.kind = 'has-left-entity' AND l.direction = 'outgoing'
            AND r.kind = 'has-right-entity' AND r.direction = 'outgoing'
    """


# Raw 16-byte UUIDs (`uuid.UUID.bytes`): fixed-width and 32 B/row for
# the pair, vs 73 B/row for `web_id~entity_uuid` strings.
UUID_DT = np.dtype("V16")
METADATA_DT = np.dtype([("entity_uuid", UUID_DT), ("web_id", UUID_DT)])


def row_lookup(
    metadata: np.ndarray,
) -> Callable[[np.ndarray], tuple[np.ndarray, np.ndarray]]:
    """
    Binary-search lookup from METADATA_DT records to their row in
    `metadata`. The two V16 fields are viewed as one 32-byte `S32` key:
    unlike raw void records, bytes keys are sortable/searchable, and
    since every key is exactly 32 meaningful bytes, numpy's
    trailing-NUL-stripping comparison cannot produce false matches.

    Returns `records -> (rows, found)`; `rows` is only meaningful where
    `found` is True.
    """
    keys = np.ascontiguousarray(metadata).view("S32")
    order = np.argsort(keys)
    sorted_keys = keys[order]

    def lookup(records: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        wanted = np.ascontiguousarray(records).view("S32")
        if not len(sorted_keys):
            return (
                np.zeros(len(wanted), dtype=np.int64),
                np.zeros(len(wanted), dtype=np.bool_),
            )

        pos = np.clip(np.searchsorted(sorted_keys, wanted), 0, len(sorted_keys) - 1)
        found = sorted_keys[pos] == wanted
        return order[pos], found

    return lookup


def fetch_embeddings(
    *,
    out_embeddings: BinaryIO,
    out_metadata: BinaryIO,
    params: SampleParams,
    seed: int,
) -> int:
    """
    Stream a subsample of entity embeddings as raw little-endian float32
    rows of `params.dim` values into `out_embeddings`, and their
    identities into `out_metadata` as an `.npy` of METADATA_DT records
    (row-aligned with the embeddings). Returns the row count.
    """
    written = 0
    metadata_chunks: list[np.ndarray] = []

    with connect() as connection:
        # Makes `vector` columns come back as pgvector `Vector` objects
        register_vector(connection)

        with connection.cursor() as cursor:
            cursor.execute(query_count())
            row = cursor.fetchone()
            assert row is not None

            (total,) = row

        with (
            connection.cursor(name="embedding_sample", binary=True) as cursor,
            # The row count is binomial around the target, so the bar
            # may finish slightly shy of, or past, 100%.
            tqdm(
                total=min(params.size, total),
                desc="fetching sample",
                unit="row",
                unit_scale=True,
            ) as progress,
        ):
            cursor.itersize = params.fetch_batch_size
            cursor.execute(
                query_embeddings(matching_rows=total, params=params, seed=seed)
            )

            while batch := cursor.fetchmany(params.fetch_batch_size):
                block = np.stack([embedding.to_numpy() for (_, _, embedding) in batch])
                out_embeddings.write(
                    np.ascontiguousarray(block, dtype=np.float32).tobytes()
                )

                metadata_chunks.append(
                    np.array(
                        [
                            (entity_uuid.bytes, web_id.bytes)
                            for (entity_uuid, web_id, _) in batch
                        ],
                        dtype=METADATA_DT,
                    )
                )

                written += len(batch)
                progress.update(len(batch))

    metadata = (
        np.concatenate(metadata_chunks)
        if metadata_chunks
        else np.empty(0, dtype=METADATA_DT)
    )
    np.save(out_metadata, metadata)

    return written


def fetch_edges(
    *, out_edges: BinaryIO, metadata: np.ndarray, fetch_batch_size: int
) -> int:
    """
    Stream every relation from the database, keep those whose endpoints
    are both in `metadata`, and save them into `out_edges` as an (m, 2)
    int64 `.npy` of row indices into the sample. Returns the number of
    edges kept.
    """
    lookup = row_lookup(metadata)
    chunks: list[np.ndarray] = []
    kept = 0

    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query_edge_count())
            row = cursor.fetchone()
            assert row is not None

            (total,) = row

        with (
            connection.cursor(name="edge_sample", binary=True) as cursor,
            tqdm(
                total=total, desc="fetching edges", unit="edge", unit_scale=True
            ) as progress,
        ):
            cursor.itersize = fetch_batch_size
            cursor.execute(query_edges())

            while batch := cursor.fetchmany(fetch_batch_size):
                sources = np.array(
                    [(eu.bytes, wu.bytes) for (eu, wu, _, _) in batch],
                    dtype=METADATA_DT,
                )
                targets = np.array(
                    [(eu.bytes, wu.bytes) for (_, _, eu, wu) in batch],
                    dtype=METADATA_DT,
                )

                source_rows, source_ok = lookup(sources)
                target_rows, target_ok = lookup(targets)

                # Both endpoints must be part of the sample; edges into
                # entities outside it carry no layout information.
                ok = source_ok & target_ok
                if ok.any():
                    chunks.append(np.stack([source_rows[ok], target_rows[ok]], axis=1))
                    kept += int(ok.sum())

                progress.update(len(batch))

    edges = np.concatenate(chunks) if chunks else np.empty((0, 2), dtype=np.int64)
    np.save(out_edges, edges)

    return kept


@dataclass(frozen=True)
class Sample:
    """
    A subsample of entity embeddings, plus the relations between them.

    `metadata` is a METADATA_DT record array (`entity_uuid`, `web_id`;
    raw 16-byte UUIDs) aligned row-for-row with `embeddings`: (n, dim)
    float32, unit-norm, memmapped from disk. `edges` is an (m, 2) int64
    array of (source, target) rows into the sample -- relations whose
    endpoints both landed in the subsample.
    """

    metadata: np.ndarray
    embeddings: np.memmap
    edges: np.ndarray

    @classmethod
    def load(
        cls, *, embeddings: Path | None = None, params: SampleParams, seed: int
    ) -> Self:
        """
        Fetch the sample, or reuse `embeddings` and its metadata sidecar
        if both already exist (trusted as-is, regardless of `params` and
        `seed`). With no path, fetches into temp files.
        """

        if embeddings is None:
            fd, name = tempfile.mkstemp(prefix="embeddings-", suffix=".f32")
            os.close(fd)
            embeddings = Path(name)
            metadata_path = embeddings.with_suffix(".metadata.npy")
            needs_fetch = True
        else:
            metadata_path = embeddings.with_suffix(".metadata.npy")
            needs_fetch = not (embeddings.exists() and metadata_path.exists())

        edges_path = embeddings.with_suffix(".edges.npy")

        if needs_fetch:
            # A fresh sample invalidates cached edges: their row indices
            # are only meaningful against the metadata they were built
            # with.
            edges_path.unlink(missing_ok=True)

            with (
                embeddings.open("wb") as out_embeddings,
                metadata_path.open("wb") as out_metadata,
            ):
                fetch_embeddings(
                    out_embeddings=out_embeddings,
                    out_metadata=out_metadata,
                    params=params,
                    seed=seed,
                )

        # The row count jitters around `params.size` (binomial sampling,
        # no LIMIT -- see query_embeddings), so derive it from the file.
        rows = embeddings.stat().st_size // (params.dim * np.float32().itemsize)
        metadata = np.load(metadata_path)

        if len(metadata) != rows:
            raise ValueError(
                f"sample cache out of sync ({len(metadata)} metadata rows vs "
                f"{rows} embeddings); delete {embeddings} and {metadata_path} "
                "to refetch"
            )

        # Edges are fetched separately (they need the metadata for the
        # UUID -> row mapping), so an embeddings cache hit can still
        # backfill missing edges.
        if not edges_path.exists():
            with edges_path.open("wb") as out_edges:
                fetch_edges(
                    out_edges=out_edges,
                    metadata=metadata,
                    fetch_batch_size=params.fetch_batch_size,
                )

        edges = np.load(edges_path)
        if edges.size and int(edges.max()) >= rows:
            raise ValueError(
                f"edge cache out of sync (row index {int(edges.max())} vs "
                f"{rows} embeddings); delete {edges_path} to refetch"
            )

        return cls(
            metadata=metadata,
            embeddings=np.memmap(
                embeddings, dtype=np.float32, mode="r", shape=(rows, params.dim)
            ),
            edges=edges,
        )
