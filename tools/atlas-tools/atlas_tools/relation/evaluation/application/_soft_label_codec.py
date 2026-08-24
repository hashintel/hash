"""Persist canonical soft-label tables and their self-verifying metadata."""

from collections.abc import Mapping, Sequence
from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import SoftLabel
from atlas_tools.relation.evaluation.application._analysis_codec import (
    SoftLabelDiskRow,
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
from atlas_tools.relation.evaluation.application._analysis_schema import (
    ORDERING_ALGORITHM,
    PARQUET_ALGORITHM,
    SOFT_LABEL_METADATA_SCHEMA,
    SOFT_LABEL_SCHEMA,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    SoftLabelsArtifact,
    SoftLabelsMetadata,
    hash_mapping,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

_ALGORITHMS = {
    "ordering": ORDERING_ALGORITHM,
    "parquet": PARQUET_ALGORITHM,
    "projection": "placement-tally-derived-posterior-v1",
    "smoothing": "dirichlet-1-1-1-v1",
    "weighting": "placement-vote-count-every-card-v1",
}

_SCHEMA_HASHES = {
    "metadata": schema_hash(SOFT_LABEL_METADATA_SCHEMA),
    "parquet": schema_hash(SOFT_LABEL_SCHEMA),
}


def write_soft_labels(
    path: Path,
    labels: Sequence[SoftLabel],
    *,
    source_hashes: Mapping[str, Sha256Hex],
) -> SoftLabelsArtifact:
    """Write soft labels and a hash-bound sidecar in canonical relation order.

    The Parquet stores only independent tally fields. Posterior, vote count,
    entropy, and review invariants are rebuilt by [`SoftLabel`] during load.

    Raises:
        ValueError: Rows are empty, repeat an identity, or provenance is empty.
        OSError: The table or sidecar cannot be durably published.

    """
    ordered = ordered_rows(labels, lambda row: row.relation_id)
    disk_rows = tuple(SoftLabelDiskRow.from_label(row) for row in ordered)
    payload = parquet_bytes(disk_rows, SOFT_LABEL_SCHEMA)
    metadata = SoftLabelsMetadata(
        schema_hashes=_SCHEMA_HASHES,
        algorithms=_ALGORITHMS,
        algorithm_hash=hash_mapping(_ALGORITHMS),
        source_hashes=dict(source_hashes),
        content_hashes={path.name: sha256_bytes(payload)},
        rows=len(ordered),
        relation_order_hash=relation_order_hash(ordered),
    )
    manifest_path = sidecar_path(path)
    atomic_replace(path, payload)
    atomic_replace(manifest_path, model_bytes(metadata))
    return SoftLabelsArtifact(
        path=path,
        sidecar_path=manifest_path,
        metadata=metadata,
        rows=ordered,
    )


def load_soft_labels(
    path: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> SoftLabelsArtifact:
    """Load soft labels after validating all durable and derived invariants.

    Raises:
        ValueError: Metadata, bytes, schema, row order, identities, or derived
            label invariants disagree.

    """
    manifest_path = sidecar_path(path)
    metadata = load_model(manifest_path, SoftLabelsMetadata)
    require_exact_mapping(
        metadata.schema_hashes,
        _SCHEMA_HASHES,
        label="soft-label schema hashes",
    )
    require_exact_mapping(
        metadata.algorithms,
        _ALGORITHMS,
        label="soft-label algorithms",
    )
    verify_expected_sources(metadata.source_hashes, expected_source_hashes)
    payload = read_bytes(path)
    verify_content_hashes(metadata.content_hashes, {path.name: payload})
    table = read_parquet(path, payload, SOFT_LABEL_SCHEMA)
    disk_rows = decode_rows(path, table, SoftLabelDiskRow)
    try:
        rows = tuple(row.to_label() for row in disk_rows)
    except ValueError as error:
        raise ValueError(f"invalid derived soft-label invariant in {path}: {error}") from error
    if len(rows) != metadata.rows:
        raise ValueError("soft-label row count does not match metadata")
    require_canonical_order(tuple(row.relation_id for row in rows))
    if relation_order_hash(rows) != metadata.relation_order_hash:
        raise ValueError("soft-label relation/card order does not match metadata")
    return SoftLabelsArtifact(
        path=path,
        sidecar_path=manifest_path,
        metadata=metadata,
        rows=rows,
    )


async def write_soft_labels_async(
    path: Path,
    labels: Sequence[SoftLabel],
    *,
    source_hashes: Mapping[str, Sha256Hex],
) -> SoftLabelsArtifact:
    """Write soft labels without blocking Trio's event loop."""
    operation = partial(
        write_soft_labels,
        path,
        tuple(labels),
        source_hashes=dict(source_hashes),
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)


async def load_soft_labels_async(
    path: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> SoftLabelsArtifact:
    """Validate soft labels without blocking Trio's event loop."""
    expected = None if expected_source_hashes is None else dict(expected_source_hashes)
    operation = partial(load_soft_labels, path, expected_source_hashes=expected)
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
