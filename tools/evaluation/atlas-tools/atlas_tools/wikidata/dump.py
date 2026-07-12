"""W2b: streaming entity extractor over the Wikidata JSON dump.

STREAM, NEVER STORE: the dump is read as a stream (seekable file or stdin);
nothing is persisted except part files, checkpoints, and the final parquet.
In production the stream is ``download | parallel bzip2 -dc | wikidata
entity-manifest --input -``; this module never writes the dump to disk.

Input format (Wikidata JSON dump): first line ``[``, then one entity JSON
per line with a trailing comma (the last entity may omit it), final ``]``.

Field extraction only (orjson): each line is parsed once and ONLY the needed
keys are accessed — id, claims.P31[].mainsnak.datavalue.value.id, sitelinks
(count only), labels (count + per-language lengths). No full-document model.
Only items (ids starting with ``Q``) are emitted. Each line becomes one
:class:`EntityRow` — deliberately a ``NamedTuple``, not a pydantic model:
this is the streaming hot path and per-entity validation of a 100M-row
stream would dominate the run; the CONFIG is validated, the stream is not.

Checkpointing / restartability
------------------------------
Every ``checkpoint_interval`` entities the buffered rows are flushed to a
numbered part file (write tmp + rename) and ``checkpoint.json`` (a
:class:`DumpCheckpoint`) is updated atomically with byte offset, entity
count, part list, and next part index. Byte offsets are tracked by summing
line lengths (works for pipes too).

Resume: for a seekable file the extractor seeks to ``byte_offset``. For
stdin the caller must position the stream, i.e. production wraps the
download with an HTTP range request (``curl -r <byte_offset>-``) using the
offset stored in the checkpoint; the extractor then continues counting from
that offset.

Because flushes happen at fixed entity intervals and the checkpoint only
advances at flush points, a killed-and-resumed run reproduces the exact same
part files and therefore a byte-identical final parquet (the final file is
written in a single ``write_table`` call from the concatenated parts).
Checkpoints are never deleted: rerunning a completed extraction is a no-op
rebuild that rewrites identical outputs.

Dump identity: the dump date and SHA come from the mirror's checksum file
via config; the stream is NEVER hashed locally.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple, Protocol

import orjson
import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import BaseModel, Field, NonNegativeInt

from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
)
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.progress import NO_PROGRESS, ProgressReporter


class EntityManifestDetails(BaseModel):
    """Sidecar details for the per-entity manifest parquet.

    ``dump_date``/``dump_sha256`` come from the mirror's checksum file via
    config; the stream is NEVER hashed locally.
    """

    rows: NonNegativeInt
    columns: list[str]
    dump_date: str
    dump_sha256: str
    input: str
    rows_sha256: str | None
    parts: NonNegativeInt
    checkpoint_interval: int


EntityManifestProvenance = Provenance[EntityManifestDetails, Config]


ENTITY_SCHEMA = pa.schema(
    [
        pa.field("qid", pa.string()),
        pa.field("p31", pa.list_(pa.string())),
        pa.field("sitelink_count", pa.int32()),
        pa.field("label_count", pa.int32()),
        # Length of the label in the primary configured language (null when
        # absent); min/mean/max are over ALL labels in the document.
        pa.field("label_len_primary", pa.int32()),
        pa.field("label_len_min", pa.int32()),
        pa.field("label_len_mean", pa.float64()),
        pa.field("label_len_max", pa.int32()),
    ]
)


class ByteLineStream(Protocol):
    """What the extractor needs from its input: line reads + (for resume on
    seekable files) absolute seeks. Satisfied by binary files, stdin.buffer,
    and test doubles."""

    def readline(self) -> bytes: ...

    def seek(self, offset: int, /) -> object: ...


class EntityRow(NamedTuple):
    """One extracted manifest row (field order == parquet column order).

    A NamedTuple, not a pydantic model: allocation-light for the streaming
    hot path (see module docstring).
    """

    qid: str
    p31: tuple[str, ...]
    sitelink_count: int
    label_count: int
    label_len_primary: int | None
    label_len_min: int | None
    label_len_mean: float | None
    label_len_max: int | None


def extract_entity_row(line: bytes, primary_language: str) -> EntityRow | None:
    """Extract one manifest row from one dump line, or None for non-entity
    lines ('[', ']', blanks) and non-item entities."""
    stripped = line.strip()
    if stripped.endswith(b","):
        stripped = stripped[:-1]
    if stripped in (b"", b"[", b"]"):
        return None
    document = orjson.loads(stripped)
    qid = document.get("id")
    if not isinstance(qid, str) or not qid.startswith("Q"):
        return None

    p31: list[str] = []
    for statement in (document.get("claims") or {}).get("P31", []):
        mainsnak = statement.get("mainsnak", {})
        if mainsnak.get("snaktype") != "value":
            continue
        value = mainsnak.get("datavalue", {}).get("value")
        if isinstance(value, dict) and isinstance(value.get("id"), str):
            p31.append(value["id"])

    labels = document.get("labels") or {}
    lengths = sorted(len(entry["value"]) for entry in labels.values())
    primary_entry = labels.get(primary_language)
    return EntityRow(
        qid=qid,
        p31=tuple(p31),
        sitelink_count=len(document.get("sitelinks") or {}),
        label_count=len(labels),
        label_len_primary=len(primary_entry["value"]) if primary_entry else None,
        label_len_min=lengths[0] if lengths else None,
        label_len_mean=(sum(lengths) / len(lengths)) if lengths else None,
        label_len_max=lengths[-1] if lengths else None,
    )


def rows_to_table(rows: list[EntityRow]) -> pa.Table:
    """Build the (single-chunk) arrow table for a batch of extracted rows."""
    columns = list(zip(*rows, strict=True)) if rows else [[] for _ in ENTITY_SCHEMA]
    arrays = [
        pa.array(column, type=field.type)
        for column, field in zip(columns, ENTITY_SCHEMA, strict=True)
    ]
    return pa.Table.from_arrays(arrays, schema=ENTITY_SCHEMA)


class DumpCheckpoint(BaseModel):
    """On-disk shape of ``checkpoint.json`` (see module docstring)."""

    byte_offset: NonNegativeInt
    entities_processed: NonNegativeInt
    parts: list[str] = Field(default_factory=list)
    next_part_index: NonNegativeInt = 0


@dataclass(frozen=True)
class ExtractionSummary:
    """What ``extract_entities`` produced (mirrored in the sidecar)."""

    rows: int
    parts: int
    rows_sha256: str | None


def _atomic_write_checkpoint(path: Path, checkpoint: DumpCheckpoint) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(checkpoint.model_dump_json(indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def _write_part(part_path: Path, rows: list[EntityRow]) -> None:
    tmp = part_path.with_name(part_path.name + ".tmp")
    pq.write_table(rows_to_table(rows), tmp)
    os.replace(tmp, part_path)


def _load_checkpoint(path: Path) -> DumpCheckpoint | None:
    if not path.exists():
        return None
    return DumpCheckpoint.model_validate_json(path.read_bytes())


def extract_entities(
    input_stream: ByteLineStream,
    *,
    config: Config,
    out_path: Path | str,
    checkpoint_dir: Path | str,
    input_name: str = "",
    seekable: bool = True,
    hash_rows: bool = True,
    progress: ProgressReporter = NO_PROGRESS,
) -> ExtractionSummary:
    """Stream the dump, write the entity manifest parquet + sidecar.

    ``input_stream`` is a binary stream. If ``seekable`` and a checkpoint
    exists, the stream is seek()ed to the checkpointed byte offset; otherwise
    (stdin) the caller must have positioned the stream (HTTP range request in
    production, see module docstring).
    """
    out_path = Path(out_path)
    checkpoint_dir = Path(checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / "checkpoint.json"

    checkpoint = _load_checkpoint(checkpoint_path)
    progress.phase("streaming dump entities")
    if checkpoint is not None:
        byte_offset = checkpoint.byte_offset
        entities_processed = checkpoint.entities_processed
        parts = list(checkpoint.parts)
        next_part_index = checkpoint.next_part_index
        if seekable:
            input_stream.seek(byte_offset)
        progress.note(
            f"resuming at byte {byte_offset:,}"
            f" ({entities_processed:,} entities already processed)"
        )
    else:
        byte_offset = 0
        entities_processed = 0
        parts = []
        next_part_index = 0

    interval = config.extraction.checkpoint_interval
    primary_language = config.extraction.primary_language
    buffered: list[EntityRow] = []

    def flush(offset: int) -> None:
        nonlocal next_part_index, buffered
        part_name = f"part-{next_part_index:05d}.parquet"
        _write_part(checkpoint_dir / part_name, buffered)
        if part_name not in parts:
            parts.append(part_name)
        next_part_index += 1
        buffered = []
        _atomic_write_checkpoint(
            checkpoint_path,
            DumpCheckpoint(
                byte_offset=offset,
                entities_processed=entities_processed,
                parts=parts,
                next_part_index=next_part_index,
            ),
        )

    while True:
        line = input_stream.readline()
        if not line:
            break
        byte_offset += len(line)
        row = extract_entity_row(line, primary_language)
        if row is None:
            continue
        buffered.append(row)
        entities_processed += 1
        if len(buffered) >= interval:
            flush(byte_offset)
            progress.note(
                f"{entities_processed:,} entities,"
                f" {byte_offset / 1_000_000:,.0f} MB read"
            )

    if buffered:
        flush(byte_offset)
    progress.note(
        f"stream done: {entities_processed:,} entities,"
        f" {byte_offset / 1_000_000:,.0f} MB; combining part files"
    )

    # Combine part files into the single final parquet, in dump order, with
    # one write_table call so interrupted and uninterrupted runs produce
    # byte-identical files.
    if parts:
        table = pa.concat_tables(
            [pq.read_table(checkpoint_dir / name) for name in parts]
        )
    else:
        table = ENTITY_SCHEMA.empty_table()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_name(out_path.name + ".tmp")
    pq.write_table(table, tmp)
    os.replace(tmp, out_path)

    rows_sha256 = None
    if hash_rows:
        digest = hashlib.sha256()
        for row in table.to_pylist():
            digest.update(canonical_json_bytes(row))
        rows_sha256 = digest.hexdigest()

    EntityManifestProvenance.make(
        producer="wikidata.entity-manifest",
        config=config,
        seed=config.extraction.seed,
        details=EntityManifestDetails(
            rows=table.num_rows,
            columns=ENTITY_SCHEMA.names,
            # From the mirror's checksum file (config), never computed locally.
            dump_date=config.extraction.dump.date,
            dump_sha256=config.extraction.dump.sha256,
            input=input_name,
            rows_sha256=rows_sha256,
            parts=len(parts),
            checkpoint_interval=interval,
        ),
    ).write(out_path.with_name(out_path.name + ".meta.json"))
    return ExtractionSummary(
        rows=table.num_rows, parts=len(parts), rows_sha256=rows_sha256
    )
