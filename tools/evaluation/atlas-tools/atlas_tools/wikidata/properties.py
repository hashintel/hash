"""W2a property extraction: inventory, wbgetentities batching, P2302 parsing,
example ladder, and the extraction orchestrator.

P2302 constraint parse scope (authoritative)
--------------------------------------------
The following constraint types are parsed:

- ``Q21510862`` symmetric constraint         -> ``Constraints.symmetric``
- ``Q18647515`` transitive constraint        -> ``Constraints.transitive``
- ``Q19474404`` single-value constraint      -> ``Constraints.single_value``
- ``Q21502410`` distinct-values constraint   -> ``Constraints.distinct_values``
- ``Q21503250`` subject type constraint      -> ``Constraints.subject_types``
  (classes from qualifier ``P2308``)
- ``Q21510865`` value type constraint        -> ``Constraints.value_types``
  (classes from qualifier ``P2308``)
- ``Q21510855`` inverse constraint           -> ``Constraints.inverse_pid``
  (property from qualifier ``P2306``)

ALL OTHER constraint types (format, allowed-qualifiers, citation-needed,
property-scope, allowed-units, one-of, none-of, contemporary, integer, range,
etc.) are explicitly ignored; their type QIDs are recorded in
``Constraints.ignored_types`` and never affect output.

Exclusion rules (configurable, applied in this order; first match wins)
-----------------------------------------------------------------------
1. ``datatype:<dt>`` — datatype is not ``wikibase-item``. The inventory
   SPARQL query already restricts to wikibase-item, but the parser
   defensively re-filters so external-identifier properties (P212-style)
   can never leak through.
2. ``maintenance`` — the property's P31 intersects
   ``config.maintenance_classes`` (Q18644435 "Wikimedia property…"-style
   classes).
3. ``deprecated`` — the property's P31 intersects
   ``config.deprecated_classes`` (Q18644427-style obsolete-property classes;
   this is the owl:deprecated proxy available in entity documents).

Example fallback ladder
-----------------------
WDQS LIMIT/OFFSET query -> QLever public endpoint -> skip with a recorded
flag. An endpoint "fails" for a property when any of its offset requests
returns a non-200 status (RequestsTransport has already retried with
backoff by then). Failures are cached like successes, so a warm-cache rerun
makes zero network calls even for failing properties.

Inverse resolution: an explicit P1696 (inverse property) statement wins;
otherwise the inverse constraint (Q21510855, qualifier P2306) is used.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from atlas_tools.common.provenance import canonical_json_bytes, sha256_bytes
from atlas_tools.wikidata.cache import RETRIEVED_AT_HEADER
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.model import Constraints, Example, PropertyRecord, pid_number
from atlas_tools.wikidata.sparql import (
    WIKIBASE_ITEM_DATATYPE,
    ExampleRow,
    InventoryRow,
    example_pairs_query,
    parse_example_results,
    parse_inventory_results,
    property_inventory_query,
    sparql_params,
)
from atlas_tools.wikidata.transport import Transport

WBGETENTITIES_BATCH_SIZE = 50

_CONSTRAINT_SYMMETRIC = "Q21510862"
_CONSTRAINT_TRANSITIVE = "Q18647515"
_CONSTRAINT_SINGLE_VALUE = "Q19474404"
_CONSTRAINT_DISTINCT_VALUES = "Q21502410"
_CONSTRAINT_SUBJECT_TYPE = "Q21503250"
_CONSTRAINT_VALUE_TYPE = "Q21510865"
_CONSTRAINT_INVERSE = "Q21510855"

_QUALIFIER_CLASS = "P2308"
_QUALIFIER_PROPERTY = "P2306"


def _snak_entity_id(snak: dict[str, Any]) -> str | None:
    if snak.get("snaktype") != "value":
        return None
    value = snak.get("datavalue", {}).get("value")
    if isinstance(value, dict):
        entity_id = value.get("id")
        if isinstance(entity_id, str):
            return entity_id
    return None


def _statement_entity_ids(claims: dict[str, Any], prop: str) -> tuple[str, ...]:
    ids: list[str] = []
    for statement in claims.get(prop, []):
        entity_id = _snak_entity_id(statement.get("mainsnak", {}))
        if entity_id is not None and entity_id not in ids:
            ids.append(entity_id)
    return tuple(ids)


def _qualifier_entity_ids(statement: dict[str, Any], qualifier: str) -> tuple[str, ...]:
    ids: list[str] = []
    for snak in statement.get("qualifiers", {}).get(qualifier, []):
        entity_id = _snak_entity_id(snak)
        if entity_id is not None and entity_id not in ids:
            ids.append(entity_id)
    return tuple(ids)


def parse_constraints(p2302_statements: list[dict[str, Any]]) -> Constraints:
    """Parse the P2302 statements of one property (scope documented above).

    Unknown constraint types are ignored without error and recorded in
    ``ignored_types`` (deduplicated, statement order preserved).
    """
    symmetric = False
    transitive = False
    single_value = False
    distinct_values = False
    subject_types: list[str] = []
    value_types: list[str] = []
    inverse_pid: str | None = None
    ignored: list[str] = []

    for statement in p2302_statements:
        constraint_type = _snak_entity_id(statement.get("mainsnak", {}))
        if constraint_type is None:
            continue
        if constraint_type == _CONSTRAINT_SYMMETRIC:
            symmetric = True
        elif constraint_type == _CONSTRAINT_TRANSITIVE:
            transitive = True
        elif constraint_type == _CONSTRAINT_SINGLE_VALUE:
            single_value = True
        elif constraint_type == _CONSTRAINT_DISTINCT_VALUES:
            distinct_values = True
        elif constraint_type == _CONSTRAINT_SUBJECT_TYPE:
            for qid in _qualifier_entity_ids(statement, _QUALIFIER_CLASS):
                if qid not in subject_types:
                    subject_types.append(qid)
        elif constraint_type == _CONSTRAINT_VALUE_TYPE:
            for qid in _qualifier_entity_ids(statement, _QUALIFIER_CLASS):
                if qid not in value_types:
                    value_types.append(qid)
        elif constraint_type == _CONSTRAINT_INVERSE:
            pids = _qualifier_entity_ids(statement, _QUALIFIER_PROPERTY)
            if pids and inverse_pid is None:
                inverse_pid = pids[0]
        else:
            if constraint_type not in ignored:
                ignored.append(constraint_type)

    return Constraints(
        symmetric=symmetric,
        transitive=transitive,
        single_value=single_value,
        distinct_values=distinct_values,
        subject_types=tuple(subject_types),
        value_types=tuple(value_types),
        inverse_pid=inverse_pid,
        ignored_types=tuple(ignored),
    )


def parse_property_document(
    doc: dict[str, Any], languages: tuple[str, ...]
) -> PropertyRecord:
    """Build a PropertyRecord (sans examples/usage) from a wbgetentities doc."""
    claims = doc.get("claims", {})
    labels = {
        lang: doc.get("labels", {})[lang]["value"]
        for lang in languages
        if lang in doc.get("labels", {})
    }
    descriptions = {
        lang: doc.get("descriptions", {})[lang]["value"]
        for lang in languages
        if lang in doc.get("descriptions", {})
    }
    aliases = {
        lang: [entry["value"] for entry in doc.get("aliases", {}).get(lang, [])]
        for lang in languages
        if doc.get("aliases", {}).get(lang)
    }
    constraints = parse_constraints(claims.get("P2302", []))
    p1696 = _statement_entity_ids(claims, "P1696")
    inverse_pid = p1696[0] if p1696 else constraints.inverse_pid
    return PropertyRecord(
        pid=doc["id"],
        datatype=doc.get("datatype", ""),
        labels=labels,
        descriptions=descriptions,
        aliases=aliases,
        p31=_statement_entity_ids(claims, "P31"),
        ancestors=_statement_entity_ids(claims, "P1647"),
        inverse_pid=inverse_pid,
        constraints=constraints,
    )


def exclusion_reason(record: PropertyRecord, config: Config) -> str | None:
    """First matching exclusion rule, or None if the property is retained."""
    if record.datatype != "wikibase-item":
        return f"datatype:{record.datatype}"
    p31 = set(record.p31)
    if p31 & set(config.maintenance_classes):
        return "maintenance"
    if p31 & set(config.deprecated_classes):
        return "deprecated"
    return None


def chunk_ids(ids: list[str], size: int = WBGETENTITIES_BATCH_SIZE) -> list[list[str]]:
    """Numeric-sorted ids in fixed-size chunks (deterministic batching)."""
    ordered = sorted(ids, key=pid_number)
    return [ordered[i : i + size] for i in range(0, len(ordered), size)]


def wbgetentities_params(ids: list[str], languages: tuple[str, ...]) -> dict[str, str]:
    return {
        "action": "wbgetentities",
        "format": "json",
        "ids": "|".join(ids),
        "props": "labels|descriptions|aliases|claims|datatype",
        "languages": "|".join(languages),
    }


def sample_diverse_examples(
    rows: list[ExampleRow], *, count: int, seed: int, pid: str
) -> list[Example]:
    """Deterministic, most-diverse-first example sampling.

    Rows are deduplicated in arrival order, grouped by subject type, shuffled
    within each group by ``np.random.default_rng([seed, pid_number])``, then
    drawn round-robin across subject types in lexicographic type order. The
    resulting order is the diversity rank: truncation drops from the END, so
    the head (one example per distinct subject type) survives longest.
    """
    seen: set[tuple[str, str, str]] = set()
    groups: dict[str, list[ExampleRow]] = {}
    for row in rows:
        key = (row.subject_label, row.object_label, row.subject_type)
        if key in seen:
            continue
        seen.add(key)
        groups.setdefault(row.subject_type, []).append(row)

    rng = np.random.default_rng([seed, pid_number(pid)])
    keys = sorted(groups)
    permuted = {
        key: [groups[key][i] for i in rng.permutation(len(groups[key]))] for key in keys
    }

    out: list[Example] = []
    depth = 0
    while len(out) < count:
        advanced = False
        for key in keys:
            group = permuted[key]
            if depth < len(group):
                row = group[depth]
                out.append(
                    Example(
                        subject_label=row.subject_label,
                        object_label=row.object_label,
                        subject_type=row.subject_type,
                    )
                )
                advanced = True
                if len(out) >= count:
                    break
        if not advanced:
            break
        depth += 1
    return out


def fetch_example_rows(
    pid: str,
    config: Config,
    transport: Transport,
    *,
    endpoints: tuple[str, ...] = ("wdqs", "qlever"),
) -> tuple[list[ExampleRow], str | None]:
    """Run the fallback ladder; returns (rows, source endpoint name or None)."""
    for endpoint_name in endpoints:
        url = config.endpoints[endpoint_name]
        rows: list[ExampleRow] = []
        ok = True
        for offset in config.example_offsets:
            query = example_pairs_query(
                pid, limit=config.example_pool_limit, offset=offset
            )
            status, _headers, body = transport.get(url, sparql_params(query))
            if status != 200:
                ok = False
                break
            rows.extend(parse_example_results(body))
        if ok:
            return rows, endpoint_name
    return [], None


@dataclass
class ExtractionResult:
    records: list[PropertyRecord]  # retained, numeric-PID order
    inventory_rows: list[InventoryRow]
    excluded: dict[str, str]  # pid -> exclusion reason
    entity_labels: dict[str, tuple[str, str]]  # id -> (label, description)
    example_fallbacks: dict[str, str]  # pid -> endpoint that rescued it
    example_skips: list[str]  # pids where the whole ladder failed
    api_snapshot_date: str = ""


class ExtractionCheckpoint:
    """Property-level progress checkpoint (JSON, atomic writes).

    Records the example-ladder outcome per PID so a rerun replays recorded
    outcomes (fetching through the response cache) instead of re-probing
    endpoints. A checkpoint whose config_hash differs from the current
    config is discarded. Combined with the response cache this makes
    rerun-after-kill idempotent.
    """

    def __init__(self, path: Path, config_hash: str) -> None:
        self.path = path
        self.config_hash = config_hash
        self.examples_done: dict[str, str | None] = {}
        if path.exists():
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("config_hash") == config_hash:
                self.examples_done = data.get("examples_done", {})

    def record_example(self, pid: str, source: str | None) -> None:
        self.examples_done[pid] = source
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.name + ".tmp")
        tmp.write_text(
            json.dumps(
                {"config_hash": self.config_hash, "examples_done": self.examples_done},
                sort_keys=True,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        os.replace(tmp, self.path)


def config_hash(config: Config) -> str:
    return sha256_bytes(canonical_json_bytes(config.raw))


def extract_properties(
    config: Config,
    transport: Transport,
    *,
    checkpoint_path: Path | str | None = None,
) -> ExtractionResult:
    """Full W2a extraction: inventory -> documents -> exclusions -> labels ->
    example ladder. All HTTP goes through ``transport``; wrap it in a
    ``CachingTransport`` for warm-cache reruns with zero network calls."""
    checkpoint = (
        ExtractionCheckpoint(Path(checkpoint_path), config_hash(config))
        if checkpoint_path is not None
        else None
    )

    # 1. Property inventory via SPARQL.
    status, _headers, body = transport.get(
        config.endpoints["wdqs"], sparql_params(property_inventory_query())
    )
    if status != 200:
        raise RuntimeError(f"property inventory query failed with status {status}")
    inventory_rows = parse_inventory_results(body)

    excluded: dict[str, str] = {}
    retained_pids: list[str] = []
    usage_by_pid: dict[str, int | None] = {}
    for row in inventory_rows:
        usage_by_pid[row.pid] = row.usage
        if row.datatype_uri != WIKIBASE_ITEM_DATATYPE:
            excluded[row.pid] = f"datatype:{row.datatype_uri.rsplit('#', 1)[-1]}"
        else:
            retained_pids.append(row.pid)

    # 2. Full property documents via wbgetentities, batches of 50.
    records: list[PropertyRecord] = []
    for batch in chunk_ids(retained_pids):
        status, headers, body = transport.get(
            config.endpoints["wikibase_api"],
            wbgetentities_params(batch, config.languages),
        )
        if status != 200:
            raise RuntimeError(f"wbgetentities batch failed with status {status}")
        retrieved_at = headers.get(RETRIEVED_AT_HEADER) or headers.get("date")
        doc = json.loads(body.decode("utf-8"))
        for pid in batch:
            entity = doc["entities"].get(pid)
            if entity is None:
                excluded[pid] = "missing-document"
                continue
            record = parse_property_document(entity, config.languages)
            record.usage_count = usage_by_pid.get(pid)
            record.retrieved_at = retrieved_at
            reason = exclusion_reason(record, config)
            if reason is not None:
                excluded[pid] = reason
            else:
                records.append(record)
    records.sort(key=lambda r: pid_number(r.pid))

    # 3. Labels/descriptions for referenced items (endpoint types) so cards
    # can render titles+descriptions. Property labels come from step 2.
    entity_labels: dict[str, tuple[str, str]] = {}
    primary = config.languages[0]
    for record in records:
        entity_labels[record.pid] = (
            record.labels.get(primary, ""),
            record.descriptions.get(primary, ""),
        )
    referenced_qids = sorted(
        {
            qid
            for record in records
            for qid in record.constraints.subject_types + record.constraints.value_types
        },
        key=pid_number,
    )
    for batch in chunk_ids(referenced_qids):
        status, _headers, body = transport.get(
            config.endpoints["wikibase_api"],
            wbgetentities_params(batch, config.languages),
        )
        if status != 200:
            raise RuntimeError(f"wbgetentities item batch failed with status {status}")
        doc = json.loads(body.decode("utf-8"))
        for qid in batch:
            entity = doc["entities"].get(qid, {})
            label = entity.get("labels", {}).get(primary, {}).get("value", "")
            description = (
                entity.get("descriptions", {}).get(primary, {}).get("value", "")
            )
            entity_labels[qid] = (label, description)

    # 4. Example ladder per retained property.
    example_fallbacks: dict[str, str] = {}
    example_skips: list[str] = []
    for record in records:
        if checkpoint is not None and record.pid in checkpoint.examples_done:
            source = checkpoint.examples_done[record.pid]
            endpoints = (source,) if source is not None else ()
        else:
            endpoints = ("wdqs", "qlever")
        if endpoints:
            rows, source = fetch_example_rows(
                record.pid, config, transport, endpoints=tuple(endpoints)
            )
        else:
            rows, source = [], None
        record.example_source = source
        if source is None:
            record.example_skipped = True
            example_skips.append(record.pid)
        else:
            if source != "wdqs":
                example_fallbacks[record.pid] = source
            record.examples = sample_diverse_examples(
                rows, count=config.example_count, seed=config.seed, pid=record.pid
            )
        if checkpoint is not None:
            checkpoint.record_example(record.pid, source)

    return ExtractionResult(
        records=records,
        inventory_rows=inventory_rows,
        excluded=excluded,
        entity_labels=entity_labels,
        example_fallbacks=example_fallbacks,
        example_skips=example_skips,
        api_snapshot_date=config.snapshot_date,
    )
