"""Structured extraction intermediate: records.jsonl + entity_labels.json.

Layering (mining is decoupled from card formatting):

1. raw response cache (``cache.py``) — provenance of every API byte;
2. ``records.jsonl`` — structured, card-format-INDEPENDENT property records
   (this module); changing the card format never requires re-extraction;
3. ``cards.jsonl`` — the versioned text projection (``cards.py``).

Files written by ``emit_records`` (all in the extract out dir):

- ``records.jsonl`` — one canonical JSON object per PropertyRecord (sorted
  keys, compact separators, UTF-8, one per line), ordered by numeric PID.
  Contains NO wall-clock fields: ``retrieved_at`` comes from the response
  cache metadata, so warm-cache reruns are byte-identical.
- ``entity_labels.json`` — a single map ``{entity id: {"label", "description"}}``
  for every entity referenced by cards (inverse/ancestor properties,
  endpoint-type QIDs). Kept as one shared file rather than embedded
  per-record because the same entity (e.g. Q5) is referenced by many
  properties; a shared map keeps records.jsonl small and duplication-free.
- ``records.meta.json`` — provenance sidecar (the only file with a
  wall-clock ``created_at``): records_format_version, api_snapshot_date,
  counts, ladder flags, exclusions, and content hashes of the two data
  files. Its ``config_hash`` is computed over the config EXCLUDING
  card-format keys (token budgets, tokenizer), so re-rendering with a
  different card config never invalidates the records.
- ``inventory.json`` — the raw inventory + exclusion reasons (an extraction
  artifact, so it is written here, not by the card renderer).

records.jsonl row schema (records_format_version 1)
----------------------------------------------------
    {
      "pid": "P361",
      "datatype": "wikibase-item",
      "labels": {"en": "part of", ...},
      "descriptions": {"en": "...", ...},
      "aliases": {"en": ["contained within", ...], ...},
      "p31": ["Q..."],
      "ancestors": ["P..."],
      "inverse_pid": "P527" | null,
      "constraints": {
        "symmetric": bool, "transitive": bool,
        "single_value": bool, "distinct_values": bool,
        "subject_types": ["Q..."], "value_types": ["Q..."],
        "inverse_pid": "P..." | null, "ignored_types": ["Q..."]
      },
      "usage_count": int | null,   # sampling-only; still banned from card text
      "examples": [{"subject_label", "object_label", "subject_type"}, ...],
      "example_source": "wdqs" | "qlever" | null,
      "example_skipped": bool,
      "retrieved_at": str | null   # from cache metadata, not emit wall clock
    }
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from atlas_tools.common.provenance import (
    canonical_json_bytes,
    provenance_block,
    read_sidecar,
    sha256_file,
    write_sidecar,
)
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Constraints, Example, PropertyRecord, pid_number
from atlas_tools.wikidata.properties import ExtractionResult

RECORDS_FORMAT_VERSION = 1

# Config keys that only affect card rendering; excluded from the records
# provenance config_hash so the records artifact stays card-independent.
CARD_FORMAT_CONFIG_KEYS = frozenset({"token_budget", "hard_token_budget", "tokenizer"})


def extraction_config(config: Config) -> dict[str, Any]:
    """The config subset that can affect records content (card keys removed)."""
    return {k: v for k, v in config.raw.items() if k not in CARD_FORMAT_CONFIG_KEYS}


def record_to_dict(record: PropertyRecord) -> dict[str, Any]:
    constraints = record.constraints
    return {
        "pid": record.pid,
        "datatype": record.datatype,
        "labels": record.labels,
        "descriptions": record.descriptions,
        "aliases": record.aliases,
        "p31": list(record.p31),
        "ancestors": list(record.ancestors),
        "inverse_pid": record.inverse_pid,
        "constraints": {
            "symmetric": constraints.symmetric,
            "transitive": constraints.transitive,
            "single_value": constraints.single_value,
            "distinct_values": constraints.distinct_values,
            "subject_types": list(constraints.subject_types),
            "value_types": list(constraints.value_types),
            "inverse_pid": constraints.inverse_pid,
            "ignored_types": list(constraints.ignored_types),
        },
        "usage_count": record.usage_count,
        "examples": [
            {
                "subject_label": example.subject_label,
                "object_label": example.object_label,
                "subject_type": example.subject_type,
            }
            for example in record.examples
        ],
        "example_source": record.example_source,
        "example_skipped": record.example_skipped,
        "retrieved_at": record.retrieved_at,
    }


def record_from_dict(data: dict[str, Any]) -> PropertyRecord:
    constraints = data["constraints"]
    return PropertyRecord(
        pid=data["pid"],
        datatype=data["datatype"],
        labels=dict(data["labels"]),
        descriptions=dict(data["descriptions"]),
        aliases={lang: list(values) for lang, values in data["aliases"].items()},
        p31=tuple(data["p31"]),
        ancestors=tuple(data["ancestors"]),
        inverse_pid=data["inverse_pid"],
        constraints=Constraints(
            symmetric=constraints["symmetric"],
            transitive=constraints["transitive"],
            single_value=constraints["single_value"],
            distinct_values=constraints["distinct_values"],
            subject_types=tuple(constraints["subject_types"]),
            value_types=tuple(constraints["value_types"]),
            inverse_pid=constraints["inverse_pid"],
            ignored_types=tuple(constraints["ignored_types"]),
        ),
        usage_count=data["usage_count"],
        examples=[
            Example(
                subject_label=example["subject_label"],
                object_label=example["object_label"],
                subject_type=example["subject_type"],
            )
            for example in data["examples"]
        ],
        example_source=data["example_source"],
        example_skipped=data["example_skipped"],
        retrieved_at=data["retrieved_at"],
    )


@dataclass
class RecordSet:
    """The loaded structured intermediate, ready for card rendering."""

    records: list[PropertyRecord]
    entity_labels: dict[str, tuple[str, str]]
    meta: dict[str, Any]
    records_path: Path


def emit_records(
    result: ExtractionResult, config: Config, out_dir: Path | str
) -> dict[str, Path]:
    """Persist the structured intermediate + inventory (see module doc)."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    records_path = out_dir / "records.jsonl"
    ordered = sorted(result.records, key=lambda r: pid_number(r.pid))
    with open(records_path, "w", encoding="utf-8") as f:
        for record in ordered:
            f.write(canonical_json_bytes(record_to_dict(record)).decode("utf-8") + "\n")

    labels_path = out_dir / "entity_labels.json"
    labels_path.write_text(
        json.dumps(
            {
                entity_id: {"label": label, "description": description}
                for entity_id, (label, description) in result.entity_labels.items()
            },
            sort_keys=True,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    excluded_sorted = dict(
        sorted(result.excluded.items(), key=lambda kv: pid_number(kv[0]))
    )
    meta_path = out_dir / "records.meta.json"
    write_sidecar(
        meta_path,
        {
            "records_format_version": RECORDS_FORMAT_VERSION,
            "api_snapshot_date": result.api_snapshot_date,
            "counts": {
                "inventory_rows": len(result.inventory_rows),
                "excluded": len(result.excluded),
                "records": len(ordered),
                "example_skips": len(result.example_skips),
            },
            "flags": {
                "example_ladder_fallbacks": dict(
                    sorted(result.example_fallbacks.items())
                ),
                "example_ladder_skips": sorted(result.example_skips, key=pid_number),
            },
            "excluded": excluded_sorted,
            "content_hashes": {
                "records.jsonl": sha256_file(records_path),
                "entity_labels.json": sha256_file(labels_path),
            },
            **provenance_block(
                producer="wikidata.extract-properties",
                config=extraction_config(config),
                seed=config.seed,
            ),
        },
    )

    inventory_path = out_dir / "inventory.json"
    write_sidecar(
        inventory_path,
        {
            "rows": [
                {"pid": row.pid, "datatype": row.datatype_uri, "usage": row.usage}
                for row in result.inventory_rows
            ],
            "retained": [record.pid for record in ordered],
            "excluded": excluded_sorted,
            **provenance_block(
                producer="wikidata.extract-properties",
                config=extraction_config(config),
                seed=config.seed,
            ),
        },
    )

    return {
        "records": records_path,
        "entity_labels": labels_path,
        "records_meta": meta_path,
        "inventory": inventory_path,
    }


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

    meta = read_sidecar(meta_path)
    version = meta.get("records_format_version")
    if version != RECORDS_FORMAT_VERSION:
        raise ValueError(
            f"records format version {version!r} unsupported"
            f" (expected {RECORDS_FORMAT_VERSION})"
        )

    records: list[PropertyRecord] = []
    with open(records_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(record_from_dict(json.loads(line)))

    with open(labels_path, encoding="utf-8") as f:
        raw_labels = json.load(f)
    entity_labels = {
        entity_id: (entry["label"], entry["description"])
        for entity_id, entry in raw_labels.items()
    }

    return RecordSet(
        records=records,
        entity_labels=entity_labels,
        meta=meta,
        records_path=records_path,
    )
