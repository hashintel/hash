"""Structured extraction intermediate: records.jsonl + entity_labels.json.

Layering (mining is decoupled from card formatting):

1. raw response cache (``cache.py``) — provenance of every API byte;
2. ``records.jsonl`` — structured, card-format-INDEPENDENT property records
   (this module); changing the card format never requires re-extraction;
3. ``cards.jsonl`` — the versioned text projection (``cards.py``).

Files written by ``emit_records`` (all in the extract out dir):

- ``records.jsonl`` — one canonical JSON object per PropertyRecord (sorted
  keys, compact separators, UTF-8, one per line), ordered by numeric PID.
  The row schema IS ``PropertyRecord``'s JSON-mode dump (see ``model.py``);
  ``RECORDS_FORMAT_VERSION`` versions it. Contains NO wall-clock fields:
  ``retrieved_at`` comes from the response cache metadata, so warm-cache
  reruns are byte-identical.
- ``entity_labels.json`` — a single map ``{entity id: EntityLabel}`` for
  every entity referenced by cards (inverse/ancestor properties,
  endpoint-type QIDs). Kept as one shared file rather than embedded
  per-record because the same entity (e.g. Q5) is referenced by many
  properties; a shared map keeps records.jsonl small and duplication-free.
- ``records.meta.json`` — a typed :class:`Provenance` envelope (the only
  file with a wall-clock ``created_at``) whose ``details`` carry
  records_format_version, api_snapshot_date, counts, ladder flags,
  exclusions, and content hashes of the two data files
  (:class:`RecordsDetails`). Its ``config``/``config_hash`` cover ONLY the
  extraction sub-config (:class:`ExtractionConfig`), so re-rendering with a
  different card config never invalidates the records.
- ``inventory.json`` — a :class:`Provenance` envelope whose ``details``
  carry the raw inventory rows + retained/excluded PIDs
  (:class:`InventoryDetails`); an extraction artifact, so it is written
  here, not by the card renderer.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, NonNegativeInt, TypeAdapter

from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
    sha256_file,
    write_sidecar,
)
from atlas_tools.wikidata.config import Config, ExtractionConfig
from atlas_tools.wikidata.model import (
    EntityLabel,
    ExampleSource,
    PropertyRecord,
    pid_number,
)
from atlas_tools.wikidata.properties import ExtractionResult

RECORDS_FORMAT_VERSION = 1

_ENTITY_LABELS_ADAPTER = TypeAdapter(dict[str, EntityLabel])


class LadderFlags(BaseModel):
    """Example-ladder outcomes (shared with the cards manifest)."""

    example_ladder_fallbacks: dict[str, ExampleSource]
    example_ladder_skips: list[str]


class ExtractionCounts(BaseModel):
    inventory_rows: NonNegativeInt
    excluded: NonNegativeInt
    records: NonNegativeInt
    example_skips: NonNegativeInt


class RecordsDetails(BaseModel):
    """Details of the records.jsonl intermediate (card-format-independent)."""

    records_format_version: int
    api_snapshot_date: str
    counts: ExtractionCounts
    flags: LadderFlags
    excluded: dict[str, str]
    content_hashes: dict[str, str]


RecordsProvenance = Provenance[RecordsDetails, ExtractionConfig]


class InventoryRowEntry(BaseModel):
    pid: str
    datatype: str
    usage: int | None


class InventoryDetails(BaseModel):
    rows: list[InventoryRowEntry]
    retained: list[str]
    excluded: dict[str, str]


InventoryProvenance = Provenance[InventoryDetails, ExtractionConfig]


@dataclass(frozen=True)
class RecordsPaths:
    """Locations of the files written by :func:`emit_records`."""

    records_jsonl: Path
    entity_labels: Path
    records_meta: Path
    inventory: Path


@dataclass
class RecordSet:
    """The loaded structured intermediate, ready for card rendering."""

    records: list[PropertyRecord]
    entity_labels: dict[str, EntityLabel]
    meta: RecordsProvenance
    records_path: Path


def emit_records(
    result: ExtractionResult, config: Config, out_dir: Path | str
) -> RecordsPaths:
    """Persist the structured intermediate + inventory (see module doc)."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    records_path = out_dir / "records.jsonl"
    ordered = sorted(result.records, key=lambda record: pid_number(record.pid))
    with open(records_path, "w", encoding="utf-8") as f:
        for record in ordered:
            f.write(canonical_json_bytes(record).decode("utf-8") + "\n")

    labels_path = out_dir / "entity_labels.json"
    write_sidecar(
        labels_path,
        {
            entity_id: entry.model_dump(mode="json")
            for entity_id, entry in result.entity_labels.items()
        },
    )

    excluded_sorted = dict(
        sorted(result.excluded.items(), key=lambda item: pid_number(item[0]))
    )
    meta_path = out_dir / "records.meta.json"
    RecordsProvenance.make(
        producer="wikidata.extract-properties",
        config=config.extraction,
        seed=config.extraction.seed,
        details=RecordsDetails(
            records_format_version=RECORDS_FORMAT_VERSION,
            api_snapshot_date=result.api_snapshot_date,
            counts=ExtractionCounts(
                inventory_rows=len(result.inventory_rows),
                excluded=len(result.excluded),
                records=len(ordered),
                example_skips=len(result.example_skips),
            ),
            flags=LadderFlags(
                example_ladder_fallbacks=dict(sorted(result.example_fallbacks.items())),
                example_ladder_skips=sorted(result.example_skips, key=pid_number),
            ),
            excluded=excluded_sorted,
            content_hashes={
                "records.jsonl": sha256_file(records_path),
                "entity_labels.json": sha256_file(labels_path),
            },
        ),
    ).write(meta_path)

    inventory_path = out_dir / "inventory.json"
    InventoryProvenance.make(
        producer="wikidata.extract-properties",
        config=config.extraction,
        seed=config.extraction.seed,
        details=InventoryDetails(
            rows=[
                InventoryRowEntry(
                    pid=row.pid, datatype=row.datatype_uri, usage=row.usage
                )
                for row in result.inventory_rows
            ],
            retained=[record.pid for record in ordered],
            excluded=excluded_sorted,
        ),
    ).write(inventory_path)

    return RecordsPaths(
        records_jsonl=records_path,
        entity_labels=labels_path,
        records_meta=meta_path,
        inventory=inventory_path,
    )


def load_records(path: Path | str) -> RecordSet:
    """Load the intermediate from a directory or a records.jsonl path.

    ``entity_labels.json`` and ``records.meta.json`` must sit next to
    ``records.jsonl``. Purely local file I/O — no transport is involved.
    """
    path = Path(path)
    records_path = path / "records.jsonl" if path.is_dir() else path
    base = records_path.parent
    labels_path = base / "entity_labels.json"
    meta_path = base / "records.meta.json"
    for required in (records_path, labels_path, meta_path):
        if not required.exists():
            raise FileNotFoundError(f"records intermediate incomplete: {required}")

    meta = RecordsProvenance.load(meta_path)
    version = meta.details.records_format_version
    if version != RECORDS_FORMAT_VERSION:
        raise ValueError(
            f"records format version {version!r} unsupported"
            f" (expected {RECORDS_FORMAT_VERSION})"
        )

    records: list[PropertyRecord] = []
    with open(records_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(PropertyRecord.model_validate_json(line))

    entity_labels = _ENTITY_LABELS_ADAPTER.validate_json(labels_path.read_bytes())

    return RecordSet(
        records=records,
        entity_labels=entity_labels,
        meta=meta,
        records_path=records_path,
    )
