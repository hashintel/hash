"""Stream entity embeddings and aligned strata from PostgreSQL."""

import hashlib
import tempfile
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

import numpy as np
import psycopg
import pyarrow as pa
import pyarrow.parquet as pq
from pgvector import Vector
from pgvector.psycopg import register_vector

from atlas_tools.common.data import Dim, Sha256Hex
from atlas_tools.common.matrix import MatrixDetails, MatrixProvenance, meta_path_for

_MATRIX_NDIM = 2
_STRATA_SCHEMA = pa.schema(
    [
        ("row", pa.int64()),
        ("web_id", pa.string()),
        ("entity_type_title", pa.string()),
        ("entity_type_base_url", pa.string()),
    ]
)
_QUERY = """
    SELECT
        embeddings.embedding,
        embeddings.web_id::text,
        edition_cache.type_titles[1],
        edition_cache.base_urls[1]
    FROM entity_embeddings embeddings
    LEFT JOIN entity_temporal_metadata temporal
      ON temporal.web_id = embeddings.web_id
     AND temporal.entity_uuid = embeddings.entity_uuid
     AND temporal.draft_id IS NOT DISTINCT FROM embeddings.draft_id
     AND embeddings.updated_at_decision_time <@ temporal.decision_time
     AND embeddings.updated_at_transaction_time <@ temporal.transaction_time
    LEFT JOIN entity_edition_cache edition_cache USING (entity_edition_id)
    WHERE embeddings.property IS NULL
    ORDER BY embeddings.web_id, embeddings.entity_uuid
"""


@dataclass(frozen=True)
class DatabaseConnectionInfo:
    host: str
    port: int
    user: str
    password: str
    database: str


@dataclass(frozen=True)
class ExportBatch:
    embeddings: np.ndarray
    web_ids: list[str]
    entity_type_titles: list[str | None]
    entity_type_base_urls: list[str | None]


@dataclass(frozen=True)
class ExportResult:
    rows: int
    dim: int
    content_sha256: Sha256Hex


class PostgresExportError(RuntimeError):
    """A PostgreSQL connection or query failure during export."""


class _BinaryWriter(Protocol):
    def write(self, data: bytes, /) -> int: ...


def _embedding_bytes(block: np.ndarray, expected_dim: int | None) -> tuple[bytes, int]:
    if block.ndim != _MATRIX_NDIM:
        raise ValueError(f"expected a 2-d embedding block, got shape {block.shape}")

    dim = int(block.shape[1])
    if expected_dim is not None and dim != expected_dim:
        raise ValueError(f"embedding dimension changed from {expected_dim} to {dim}")

    return np.ascontiguousarray(block, dtype="<f4").tobytes(), dim


def _write_strata_batch(writer: pq.ParquetWriter, batch: ExportBatch, row_start: int) -> None:
    rows = int(batch.embeddings.shape[0])
    label_columns = (
        batch.web_ids,
        batch.entity_type_titles,
        batch.entity_type_base_urls,
    )
    if any(len(column) != rows for column in label_columns):
        raise ValueError("strata labels are not aligned with the embedding block")

    writer.write_table(
        pa.table(
            {
                "row": np.arange(row_start, row_start + rows, dtype=np.int64),
                "web_id": batch.web_ids,
                "entity_type_title": batch.entity_type_titles,
                "entity_type_base_url": batch.entity_type_base_urls,
            },
            schema=_STRATA_SCHEMA,
        )
    )


def _write_export_batches(
    batches: Iterable[ExportBatch],
    output: _BinaryWriter,
    *,
    strata_path: Path | None = None,
) -> ExportResult:
    rows = 0
    expected_dim: int | None = None
    digest = hashlib.sha256()
    strata_writer = (
        pq.ParquetWriter(strata_path, _STRATA_SCHEMA) if strata_path is not None else None
    )

    try:
        for batch in batches:
            if batch.embeddings.shape[0] == 0:
                continue

            data, expected_dim = _embedding_bytes(batch.embeddings, expected_dim)
            output.write(data)
            digest.update(data)
            if strata_writer is not None:
                _write_strata_batch(strata_writer, batch, rows)
            rows += int(batch.embeddings.shape[0])
    finally:
        if strata_writer is not None:
            strata_writer.close()

    if expected_dim is None:
        raise ValueError("entity_embeddings contains no whole-entity embeddings")

    return ExportResult(rows=rows, dim=expected_dim, content_sha256=digest.hexdigest())


def _embedding_batches(
    connection: psycopg.Connection,
    *,
    batch_size: int,
) -> Iterable[ExportBatch]:
    register_vector(connection)
    with connection.cursor(name="atlas_audit_embeddings", binary=True) as cursor:
        cursor.itersize = batch_size
        cursor.execute(_QUERY)
        while rows := cursor.fetchmany(batch_size):
            yield ExportBatch(
                embeddings=np.stack([cast("Vector", row[0]).to_numpy() for row in rows]),
                web_ids=[cast("str", row[1]) for row in rows],
                entity_type_titles=[cast("str | None", row[2]) for row in rows],
                entity_type_base_urls=[cast("str | None", row[3]) for row in rows],
            )


def _temporary_path(target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=target.parent,
        prefix=f".{target.name}.",
        suffix=".tmp",
        delete=False,
    ) as temporary:
        return Path(temporary.name)


def export_entity_embeddings(
    output_path: Path,
    *,
    connection_info: DatabaseConnectionInfo,
    strata_path: Path | None = None,
    batch_size: int = 1_000,
) -> MatrixProvenance:
    """Export whole-entity embeddings and optional row-aligned strata."""
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    output_temporary_path = _temporary_path(output_path)
    strata_temporary_path = _temporary_path(strata_path) if strata_path is not None else None

    try:
        with output_temporary_path.open("wb") as output:
            try:
                with psycopg.connect(
                    host=connection_info.host,
                    port=connection_info.port,
                    user=connection_info.user,
                    password=connection_info.password,
                    dbname=connection_info.database,
                ) as connection:
                    result = _write_export_batches(
                        _embedding_batches(connection, batch_size=batch_size),
                        output,
                        strata_path=strata_temporary_path,
                    )
            except psycopg.Error as error:
                raise PostgresExportError(f"PostgreSQL export failed: {error}") from error

        output_temporary_path.replace(output_path)
        if strata_path is not None and strata_temporary_path is not None:
            strata_temporary_path.replace(strata_path)

        details = MatrixDetails(
            dtype="f32",
            dim=Dim(result.dim),
            rows=result.rows,
            byte_order="little",
            content_sha256=result.content_sha256,
            extra={
                "source": {
                    "host": connection_info.host,
                    "port": connection_info.port,
                    "database": connection_info.database,
                    "table": "entity_embeddings",
                    "filter": "property IS NULL",
                }
            },
        )
        provenance = MatrixProvenance.make(
            producer="atlas-tools audit export-postgres",
            details=details,
        )
        provenance.write(meta_path_for(output_path))
        return provenance
    finally:
        output_temporary_path.unlink(missing_ok=True)
        if strata_temporary_path is not None:
            strata_temporary_path.unlink(missing_ok=True)
