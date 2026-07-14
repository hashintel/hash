"""Persist packed embeddings with exact model, dimension, and card identity."""

from collections.abc import Mapping, Sequence
from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import EmbeddingRow
from atlas_tools.relation.evaluation.application._analysis_codec import (
    EMBEDDING_METADATA_SCHEMA,
    EMBEDDING_SCHEMA,
    ORDERING_ALGORITHM,
    PARQUET_ALGORITHM,
    EmbeddingDiskRow,
    atomic_replace,
    decode_rows,
    load_model,
    model_bytes,
    ordered_rows,
    parquet_bytes,
    read_bytes,
    read_parquet,
    relation_order_hash,
    require_canonical_order,
    require_exact_mapping,
    schema_hash,
    sha256_bytes,
    sidecar_path,
    verify_content_hashes,
    verify_expected_sources,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    EmbeddingsArtifact,
    EmbeddingsMetadata,
    hash_mapping,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

_SCHEMA_HASHES = {
    "metadata": schema_hash(EMBEDDING_METADATA_SCHEMA),
    "parquet": schema_hash(EMBEDDING_SCHEMA),
}


def _algorithms(embedding_model: str) -> dict[str, str]:
    return {
        "embedding_model": embedding_model,
        "ordering": ORDERING_ALGORITHM,
        "parquet": PARQUET_ALGORITHM,
        "vector_encoding": "f32-le-v1",
    }


def write_embeddings(
    path: Path,
    rows: Sequence[EmbeddingRow],
    *,
    embedding_model: str,
    source_hashes: Mapping[str, Sha256Hex],
) -> EmbeddingsArtifact:
    """Write embeddings in canonical relation order with a hash-bound sidecar.

    Raises:
        ValueError: Rows are empty, repeat a relation, differ in dimension, or
            metadata is incomplete.
        OSError: The table or sidecar cannot be durably published.

    """
    ordered = ordered_rows(rows, lambda row: row.relation_id)
    dimensions = {row.dimension for row in ordered}
    if len(dimensions) != 1:
        raise ValueError("embedding artifact rows must have one dimension")
    dimension = dimensions.pop()
    algorithms = _algorithms(embedding_model)
    disk_rows = tuple(EmbeddingDiskRow.from_embedding(row) for row in ordered)
    payload = parquet_bytes(disk_rows, EMBEDDING_SCHEMA)
    metadata = EmbeddingsMetadata(
        schema_hashes=_SCHEMA_HASHES,
        algorithms=algorithms,
        algorithm_hash=hash_mapping(algorithms),
        source_hashes=dict(source_hashes),
        content_hashes={path.name: sha256_bytes(payload)},
        rows=len(ordered),
        relation_order_hash=relation_order_hash(ordered),
        embedding_model=embedding_model,
        dimension=dimension,
    )
    manifest_path = sidecar_path(path)
    atomic_replace(path, payload)
    atomic_replace(manifest_path, model_bytes(metadata))
    return EmbeddingsArtifact(
        path=path,
        sidecar_path=manifest_path,
        metadata=metadata,
        rows=ordered,
    )


def load_embeddings(
    path: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
    expected_embedding_model: str | None = None,
) -> EmbeddingsArtifact:
    """Load embeddings only after validating bytes, schema, model, and cards.

    Raises:
        ValueError: A durable contract or optional caller expectation differs.

    """
    manifest_path = sidecar_path(path)
    metadata = load_model(manifest_path, EmbeddingsMetadata)
    algorithms = _algorithms(metadata.embedding_model)
    require_exact_mapping(
        metadata.schema_hashes,
        _SCHEMA_HASHES,
        label="embedding schema hashes",
    )
    require_exact_mapping(
        metadata.algorithms,
        algorithms,
        label="embedding algorithms",
    )
    verify_expected_sources(metadata.source_hashes, expected_source_hashes)
    if (
        expected_embedding_model is not None
        and metadata.embedding_model != expected_embedding_model
    ):
        raise ValueError("embedding model does not match the expected model")
    payload = read_bytes(path)
    verify_content_hashes(metadata.content_hashes, {path.name: payload})
    table = read_parquet(path, payload, EMBEDDING_SCHEMA)
    disk_rows = decode_rows(path, table, EmbeddingDiskRow)
    try:
        rows = tuple(row.to_embedding() for row in disk_rows)
    except ValueError as error:
        raise ValueError(f"invalid packed embedding in {path}: {error}") from error
    if len(rows) != metadata.rows:
        raise ValueError("embedding row count does not match metadata")
    if any(row.dimension != metadata.dimension for row in rows):
        raise ValueError("embedding dimension does not match metadata")
    if any(row.encoding != metadata.vector_encoding for row in rows):
        raise ValueError("embedding encoding does not match metadata")
    require_canonical_order(tuple(row.relation_id for row in rows))
    if relation_order_hash(rows) != metadata.relation_order_hash:
        raise ValueError("embedding relation/card order does not match metadata")
    return EmbeddingsArtifact(
        path=path,
        sidecar_path=manifest_path,
        metadata=metadata,
        rows=rows,
    )


async def write_embeddings_async(
    path: Path,
    rows: Sequence[EmbeddingRow],
    *,
    embedding_model: str,
    source_hashes: Mapping[str, Sha256Hex],
) -> EmbeddingsArtifact:
    """Write embeddings without blocking Trio's event loop."""
    operation = partial(
        write_embeddings,
        path,
        tuple(rows),
        embedding_model=embedding_model,
        source_hashes=dict(source_hashes),
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)


async def load_embeddings_async(
    path: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
    expected_embedding_model: str | None = None,
) -> EmbeddingsArtifact:
    """Validate embeddings without blocking Trio's event loop."""
    expected = None if expected_source_hashes is None else dict(expected_source_hashes)
    operation = partial(
        load_embeddings,
        path,
        expected_source_hashes=expected,
        expected_embedding_model=expected_embedding_model,
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
