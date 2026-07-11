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
Only items (ids starting with ``Q``) are emitted.

Checkpointing / restartability
------------------------------
Every ``checkpoint_interval`` entities the buffered rows are flushed to a
numbered part file (write tmp + rename) and ``checkpoint.json`` is updated
atomically with ``{byte_offset, entities_processed, parts, next_part_index}``.
Byte offsets are tracked by summing line lengths (works for pipes too).

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
import json
import os
from pathlib import Path
from typing import Any, BinaryIO

import orjson
import pyarrow as pa
import pyarrow.parquet as pq

from atlas_tools.common.provenance import (
    canonical_json_bytes,
    make_provenance,
    write_sidecar,
)
from atlas_tools.wikidata.config import Config

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


def extract_entity_row(line: bytes, primary_language: str) -> dict[str, Any] | None:
    """Extract one manifest row from one dump line, or None for non-entity
    lines ('[', ']', blanks) and non-item entities."""
    stripped = line.strip()
    if stripped.endswith(b","):
        stripped = stripped[:-1]
    if stripped in (b"", b"[", b"]"):
        return None
    doc = orjson.loads(stripped)
    qid = doc.get("id")
    if not isinstance(qid, str) or not qid.startswith("Q"):
        return None

    p31: list[str] = []
    for statement in (doc.get("claims") or {}).get("P31", []):
        mainsnak = statement.get("mainsnak", {})
        if mainsnak.get("snaktype") != "value":
            continue
        value = mainsnak.get("datavalue", {}).get("value")
        if isinstance(value, dict) and isinstance(value.get("id"), str):
            p31.append(value["id"])

    labels = doc.get("labels") or {}
    lengths = sorted(len(entry["value"]) for entry in labels.values())
    primary_entry = labels.get(primary_language)
    return {
        "qid": qid,
        "p31": p31,
        "sitelink_count": len(doc.get("sitelinks") or {}),
        "label_count": len(labels),
        "label_len_primary": len(primary_entry["value"]) if primary_entry else None,
        "label_len_min": lengths[0] if lengths else None,
        "label_len_mean": (sum(lengths) / len(lengths)) if lengths else None,
        "label_len_max": lengths[-1] if lengths else None,
    }


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(
        json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(tmp, path)


def _write_part(part_path: Path, rows: list[dict[str, Any]]) -> None:
    table = pa.Table.from_pylist(rows, schema=ENTITY_SCHEMA)
    tmp = part_path.with_name(part_path.name + ".tmp")
    pq.write_table(table, tmp)
    os.replace(tmp, part_path)


def _load_checkpoint(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def extract_entities(
    input_stream: BinaryIO,
    *,
    config: Config,
    out_path: Path | str,
    checkpoint_dir: Path | str,
    input_name: str = "",
    seekable: bool = True,
    hash_rows: bool = True,
) -> dict[str, Any]:
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
    if checkpoint is not None:
        byte_offset = int(checkpoint["byte_offset"])
        entities_processed = int(checkpoint["entities_processed"])
        parts: list[str] = list(checkpoint["parts"])
        next_part_index = int(checkpoint["next_part_index"])
        if seekable:
            input_stream.seek(byte_offset)
    else:
        byte_offset = 0
        entities_processed = 0
        parts = []
        next_part_index = 0

    interval = config.checkpoint_interval
    primary_language = config.languages[0]
    buffered: list[dict[str, Any]] = []

    def flush(offset: int) -> None:
        nonlocal next_part_index, buffered
        part_name = f"part-{next_part_index:05d}.parquet"
        _write_part(checkpoint_dir / part_name, buffered)
        if part_name not in parts:
            parts.append(part_name)
        next_part_index += 1
        buffered = []
        _atomic_write_json(
            checkpoint_path,
            {
                "byte_offset": offset,
                "entities_processed": entities_processed,
                "parts": parts,
                "next_part_index": next_part_index,
            },
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

    if buffered:
        flush(byte_offset)

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

    sidecar = {
        "rows": table.num_rows,
        "columns": ENTITY_SCHEMA.names,
        # From the mirror's checksum file (config), never computed locally.
        "dump_date": config.dump.date,
        "dump_sha256": config.dump.sha256,
        "input": input_name,
        "rows_sha256": rows_sha256,
        "parts": len(parts),
        "checkpoint_interval": interval,
        **make_provenance(
            producer="wikidata.entity-manifest",
            config=config.raw,
            seed=config.seed,
        ),
    }
    write_sidecar(out_path.with_name(out_path.name + ".meta.json"), sidecar)
    return {"rows": table.num_rows, "parts": len(parts), "rows_sha256": rows_sha256}
