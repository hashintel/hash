"""Bind snapshot-derived Wikidata lineage to an exact existing card leaf."""

import json
import os
import shutil
import tempfile
from os import PathLike
from pathlib import Path

from pydantic import JsonValue, TypeAdapter

from atlas_tools.relation.domain.api import RelationSourceSpec
from atlas_tools.relation.lineage.api import (
    WIKIDATA_INVERSE_EDGE_KIND,
    SourceSnapshotIdentity,
    publish_source_lineage,
)
from atlas_tools.relation_cards.wikidata.cards import CardsPaths, _lineage_nodes
from atlas_tools.wikidata.model import WikidataSnapshotIdentity
from atlas_tools.wikidata.records import RecordSet

_CARDS_FILENAME = "cards.jsonl"
_CARDS_MANIFEST_FILENAME = "cards.manifest.json"
_LINEAGE_FILENAME = "lineage.jsonl"
_LINEAGE_MANIFEST_FILENAME = "lineage.manifest.json"
_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
_WIKIDATA_SOURCE = RelationSourceSpec(namespace="wikidata", local_id_field="pid")


def _write_durable(destination: Path, payload: bytes) -> None:
    with destination.open("xb") as output_file:
        written = output_file.write(payload)
        if written != len(payload):
            raise OSError(f"short write for {destination}: wrote {written} of {len(payload)} bytes")
        output_file.flush()
        os.fsync(output_file.fileno())


def _copy_durable(source: Path, destination: Path) -> None:
    with source.open("rb") as input_file, destination.open("xb") as output_file:
        shutil.copyfileobj(input_file, output_file)
        output_file.flush()
        os.fsync(output_file.fileno())


def _manifest_bytes(payload: dict[str, JsonValue]) -> bytes:
    return json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"


def _copy_or_upgrade_manifest(
    source: Path,
    destination: Path,
    snapshot: WikidataSnapshotIdentity,
) -> None:
    payload = _JSON_OBJECT_ADAPTER.validate_json(source.read_bytes(), strict=True)
    raw_details = payload.get("details")
    if not isinstance(raw_details, dict):
        raise TypeError(f"Wikidata card manifest {source} must contain object details")
    details = dict(raw_details)
    expected_snapshot = snapshot.model_dump(mode="json")
    expected_source = _WIKIDATA_SOURCE.model_dump(mode="json")

    declared_snapshot = details.get("snapshot")
    declared_source = details.get("relation_source")
    if declared_snapshot is not None and declared_snapshot != expected_snapshot:
        raise ValueError("Wikidata card manifest snapshot differs from lineage records")
    if declared_source is not None and declared_source != expected_source:
        raise ValueError("Wikidata card manifest relation source is not wikidata:pid")

    if declared_snapshot is not None and declared_source is not None:
        _copy_durable(source, destination)
        return

    if details.get("api_snapshot_date") != snapshot.value:
        raise ValueError(
            "legacy Wikidata card manifest api_snapshot_date differs from lineage records"
        )
    details["snapshot"] = expected_snapshot
    details["relation_source"] = expected_source
    payload["details"] = details
    _write_durable(destination, _manifest_bytes(payload))


def _sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def backfill_lineage(
    record_set: RecordSet,
    *,
    cards_directory: PathLike,
    output_directory: PathLike,
) -> CardsPaths:
    """Publish rich source lineage beside byte-identical existing cards.

    The record snapshot and leaf-card snapshot must compare equal. Card bytes
    and their manifest are copied without rerendering, so existing evaluation
    evidence remains bound to the exact text it judged.
    """
    source = Path(cards_directory)
    destination = Path(output_directory)
    if destination.exists():
        raise FileExistsError(f"Wikidata lineage destination already exists: {destination}")

    source_cards = source / _CARDS_FILENAME
    source_manifest = source / _CARDS_MANIFEST_FILENAME
    for required in (source_cards, source_manifest):
        if not required.is_file():
            raise FileNotFoundError(f"Wikidata card leaf is incomplete: {required}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(
            prefix=f".{destination.name}.staging-",
            dir=destination.parent,
        )
    )
    published = False
    try:
        _copy_durable(source_cards, temporary / _CARDS_FILENAME)
        snapshot = WikidataSnapshotIdentity(value=record_set.meta.details.api_snapshot_date)
        _copy_or_upgrade_manifest(
            source_manifest,
            temporary / _CARDS_MANIFEST_FILENAME,
            snapshot,
        )
        publish_source_lineage(
            _lineage_nodes(record_set.lineage),
            cards_directory=temporary,
            output_directory=temporary,
            producer="wikidata.backfill-lineage",
            snapshot=SourceSnapshotIdentity.model_validate(
                snapshot.model_dump(mode="json"),
                strict=True,
            ),
            raw_inputs={
                "lineage-records.jsonl": record_set.lineage_path,
                "records.jsonl": record_set.records_path,
            },
            inverse_edge_kinds=(WIKIDATA_INVERSE_EDGE_KIND,),
        )
        _sync_directory(temporary)
        os.rename(temporary, destination)  # noqa: PTH104 -- required publication primitive
        published = True
        _sync_directory(destination.parent)
    finally:
        if not published:
            shutil.rmtree(temporary, ignore_errors=True)

    return CardsPaths(
        cards_jsonl=destination / _CARDS_FILENAME,
        manifest=destination / _CARDS_MANIFEST_FILENAME,
        lineage_jsonl=destination / _LINEAGE_FILENAME,
        lineage_manifest=destination / _LINEAGE_MANIFEST_FILENAME,
    )
