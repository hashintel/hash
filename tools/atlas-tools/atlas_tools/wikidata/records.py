"""Structured extraction intermediate: records.jsonl + entity_labels.json.

Layering (mining is decoupled from card formatting):

1. raw response cache (``cache.py``): provenance of every API byte;
2. ``records.jsonl``: structured, card-format-independent property records
   (this module); changing the card format never requires re-extraction;
3. ``cards.jsonl``: the versioned text projection
   (``relation_cards.wikidata.cards``).

Files written by ``emit_records`` (all in the extraction output directory):

- ``records.jsonl``: one canonical JSON object per PropertyRecord (sorted
  keys, compact separators, UTF-8, one per line), ordered by numeric PID.
  The row schema is ``PropertyRecord``'s JSON-mode dump (see ``model.py``);
  ``RECORDS_FORMAT_VERSION`` versions it. It contains no wall-clock
  fields: ``retrieved_at`` comes from the response cache metadata, so
  warm-cache reruns are byte-identical.
- ``entity_labels.json``: a single map ``{entity id: EntityLabel}`` for
  every entity referenced by cards (inverse/ancestor properties,
  endpoint-type QIDs). Kept as one shared file rather than embedded
  per-record because the same entity (Q5, say) is referenced by many
  properties; a shared map keeps records.jsonl small and duplication-free.
- ``lineage-records.jsonl``: the closed property universe with exact direct
  P1647 and explicit P1696 IDs, including dependency-only properties that
  have no card. This is the zero-network source for lineage publication.
- ``records.meta.json``: a typed :class:`Provenance` envelope (the only
  file with a wall-clock ``created_at``) whose ``details`` carry
  records_format_version, api_snapshot_date, counts, ladder flags,
  exclusions, and content hashes of all three data files
  (:class:`RecordsDetails`). Its ``config``/``config_hash`` cover only the
  extraction sub-config (:class:`ExtractionConfig`), so re-rendering with a
  different card config never invalidates the records.
- ``inventory.json``: a :class:`Provenance` envelope whose ``details``
  carry the raw inventory rows plus retained/excluded PIDs
  (:class:`InventoryDetails`); an extraction artifact, so it is written
  here, not by the card renderer.
"""

from dataclasses import dataclass
from os import PathLike
from pathlib import Path

from pydantic import BaseModel, Field, NonNegativeInt, TypeAdapter

from atlas_tools.common.data import Sha256Hex
from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
    sha256_file,
    write_sidecar,
)
from atlas_tools.wikidata.config import Config, ExtractionConfig
from atlas_tools.wikidata.model import (
    EntityId,
    EntityLabel,
    ExampleSource,
    PropertyLineage,
    PropertyRecord,
    entity_number,
)
from atlas_tools.wikidata.properties import ExtractionResult

# v4: records preserve direct P1647 and every explicit P1696 separately
# from card presentation fields, and lineage-records.jsonl carries the
# dependency-closed source universe. Earlier records cannot reconstruct
# direct lineage without returning to the snapshot-pinned source documents.
RECORDS_FORMAT_VERSION = 4

_ENTITY_LABELS_ADAPTER = TypeAdapter(dict[EntityId, EntityLabel])


class LadderFlags(BaseModel):
    """Example-ladder outcomes (shared with the cards manifest)."""

    example_ladder_fallbacks: dict[str, ExampleSource]
    example_ladder_skips: list[str]
    # pid -> untyped candidates dropped under stratification (the
    # reversed-statement guard).
    example_rows_filtered: dict[str, int]
    # pid -> typed candidates matching no subject-type constraint class;
    # a persistently large bucket means the constraint list is stale.
    example_other_candidates: dict[str, int] = Field(default_factory=dict)
    # pids whose constraint strata were all empty: examples fell back to
    # the unstratified `other` pool.
    example_other_fallbacks: list[str] = Field(default_factory=list)


class ExtractionCounts(BaseModel):
    inventory_rows: NonNegativeInt
    excluded: NonNegativeInt
    records: NonNegativeInt
    lineage_nodes: NonNegativeInt
    example_skips: NonNegativeInt


class RecordsDetails(BaseModel):
    """Details of the records.jsonl intermediate (card-format-independent)."""

    records_format_version: int
    api_snapshot_date: str
    counts: ExtractionCounts
    flags: LadderFlags
    excluded: dict[str, str]
    content_hashes: dict[str, Sha256Hex]


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
    lineage_records: Path
    records_meta: Path
    inventory: Path


@dataclass
class RecordSet:
    """The loaded structured intermediate, ready for card and lineage rendering."""

    records: list[PropertyRecord]
    entity_labels: dict[EntityId, EntityLabel]
    lineage: tuple[PropertyLineage, ...]
    meta: RecordsProvenance
    records_path: Path
    lineage_path: Path


def emit_records(result: ExtractionResult, config: Config, out_dir: PathLike) -> RecordsPaths:
    """Persist the structured intermediate + inventory (see module doc)."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    records_path = out_dir / "records.jsonl"
    ordered = sorted(result.records, key=lambda record: entity_number(record.pid))
    with records_path.open("w", encoding="utf-8") as records_file:
        records_file.writelines(
            canonical_json_bytes(record).decode("utf-8") + "\n" for record in ordered
        )

    labels_path = out_dir / "entity_labels.json"
    write_sidecar(
        labels_path,
        {
            entity_id: entry.model_dump(mode="json")
            for entity_id, entry in result.entity_labels.items()
        },
    )

    lineage_path = out_dir / "lineage-records.jsonl"
    ordered_lineage = sorted(result.lineage, key=lambda node: node.pid)
    with lineage_path.open("w", encoding="utf-8") as lineage_file:
        lineage_file.writelines(
            canonical_json_bytes(node).decode("utf-8") + "\n" for node in ordered_lineage
        )

    excluded_sorted = dict(sorted(result.excluded.items(), key=lambda item: entity_number(item[0])))
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
                lineage_nodes=len(ordered_lineage),
                example_skips=len(result.example_skips),
            ),
            flags=LadderFlags(
                example_ladder_fallbacks=dict(sorted(result.example_fallbacks.items())),
                example_ladder_skips=sorted(result.example_skips, key=entity_number),
                example_rows_filtered=dict(
                    sorted(
                        result.example_filtered.items(),
                        key=lambda item: entity_number(item[0]),
                    )
                ),
                example_other_candidates=dict(
                    sorted(
                        result.example_other.items(),
                        key=lambda item: entity_number(item[0]),
                    )
                ),
                example_other_fallbacks=sorted(result.example_other_fallbacks, key=entity_number),
            ),
            excluded=excluded_sorted,
            content_hashes={
                "records.jsonl": sha256_file(records_path),
                "entity_labels.json": sha256_file(labels_path),
                "lineage-records.jsonl": sha256_file(lineage_path),
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
                InventoryRowEntry(pid=row.pid, datatype=row.datatype_uri, usage=row.usage)
                for row in result.inventory_rows
            ],
            retained=[record.pid for record in ordered],
            excluded=excluded_sorted,
        ),
    ).write(inventory_path)

    return RecordsPaths(
        records_jsonl=records_path,
        entity_labels=labels_path,
        lineage_records=lineage_path,
        records_meta=meta_path,
        inventory=inventory_path,
    )


def _verify_data_hashes(
    data_paths: dict[str, Path],
    recorded_hashes: dict[str, Sha256Hex],
) -> None:
    if set(recorded_hashes) != set(data_paths):
        raise ValueError(
            "records content hashes must cover exactly: " + ", ".join(sorted(data_paths))
        )

    for name, data_path in data_paths.items():
        if sha256_file(data_path) != recorded_hashes[name]:
            raise ValueError(f"records intermediate content hash mismatch: {name}")


def _load_property_records(path: Path) -> list[PropertyRecord]:
    with path.open(encoding="utf-8") as records_file:
        records = [
            PropertyRecord.model_validate_json(line) for line in records_file if line.strip()
        ]

    record_ids = tuple(record.pid for record in records)
    expected_order = tuple(sorted(record_ids, key=entity_number))
    if record_ids != expected_order:
        raise ValueError("records must use ascending numeric PID order")

    if len(record_ids) != len(set(record_ids)):
        raise ValueError("records must not repeat a PID")

    return records


def _load_property_lineage(path: Path) -> list[PropertyLineage]:
    with path.open(encoding="utf-8") as lineage_file:
        lineage = [
            PropertyLineage.model_validate_json(line) for line in lineage_file if line.strip()
        ]

    lineage_ids = tuple(node.pid for node in lineage)
    if lineage_ids != tuple(sorted(lineage_ids)):
        raise ValueError("lineage records must use ascending PID order")

    if len(lineage_ids) != len(set(lineage_ids)):
        raise ValueError("lineage records must not repeat a PID")

    return lineage


def _validate_lineage_universe(
    records: list[PropertyRecord],
    lineage: list[PropertyLineage],
) -> None:
    lineage_by_pid = {node.pid: node for node in lineage}
    for node in lineage:
        for target in (*node.direct_ancestors, *node.p1696_inverse_pids):
            if target not in lineage_by_pid:
                raise ValueError(f"lineage fact {node.pid} -> {target} has no target record")

    for record in records:
        source = lineage_by_pid.get(record.pid)
        if source is None:
            raise ValueError(f"record {record.pid} has no source lineage node")
        if source.direct_ancestors != record.direct_ancestors:
            raise ValueError(f"record {record.pid} direct P1647 facts disagree with source lineage")
        if source.p1696_inverse_pids != record.p1696_inverse_pids:
            raise ValueError(f"record {record.pid} P1696 facts disagree with source lineage")


def load_records(path: PathLike) -> RecordSet:
    """Load and hash-verify the zero-network card/lineage intermediate."""
    path = Path(path)
    records_path = path / "records.jsonl" if path.is_dir() else path
    base = records_path.parent
    labels_path = base / "entity_labels.json"
    lineage_path = base / "lineage-records.jsonl"
    meta_path = base / "records.meta.json"
    for required in (records_path, labels_path, lineage_path, meta_path):
        if not required.exists():
            raise FileNotFoundError(f"records intermediate incomplete: {required}")

    meta = RecordsProvenance.load(meta_path)
    version = meta.details.records_format_version
    if version != RECORDS_FORMAT_VERSION:
        raise ValueError(
            f"records format version {version!r} unsupported (expected {RECORDS_FORMAT_VERSION})"
        )

    _verify_data_hashes(
        {
            "entity_labels.json": labels_path,
            "lineage-records.jsonl": lineage_path,
            "records.jsonl": records_path,
        },
        meta.details.content_hashes,
    )
    records = _load_property_records(records_path)
    lineage = _load_property_lineage(lineage_path)
    if meta.details.counts.records != len(records):
        raise ValueError("records count differs from records.meta.json")

    if meta.details.counts.lineage_nodes != len(lineage):
        raise ValueError("lineage node count differs from records.meta.json")

    _validate_lineage_universe(records, lineage)

    return RecordSet(
        records=records,
        entity_labels=_ENTITY_LABELS_ADAPTER.validate_json(labels_path.read_bytes()),
        lineage=tuple(lineage),
        meta=meta,
        records_path=records_path,
        lineage_path=lineage_path,
    )
