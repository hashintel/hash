"""W2a property extraction: inventory, wbgetentities batching, P2302 parsing,
example ladder, and the extraction orchestrator.

P2302 constraint parse scope (authoritative)
--------------------------------------------
The parsed constraint types are the members of
:class:`~atlas_tools.wikidata.model.ConstraintKind`:

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
   ``extraction.maintenance_classes`` (Q18644435 "Wikimedia property…"-style
   classes).
3. ``deprecated`` — the property's P31 intersects
   ``extraction.deprecated_classes`` (Q18644427-style obsolete-property
   classes; this is the owl:deprecated proxy available in entity documents).

Example fallback ladder
-----------------------
Endpoints are tried in ``extraction.example_endpoint_ladder`` order
(config, default QLever -> WDQS), then skip with a recorded flag; the
outcome is a :data:`LadderOutcome` (``LadderSuccess`` tagged with its
source endpoint, or ``LadderSkip``). ``example_fallbacks`` records every
property NOT served by the first rung. An endpoint "fails" for a property
when any of its offset requests returns a non-200 status
(``RequestsTransport`` has already retried with backoff by then). Failures
are cached like successes, so a warm-cache rerun makes zero network calls
even for failing properties.

QLever-first reverses the PRD's WDQS-first prescription deliberately: the
deep-offset subquery form (see sparql.py) times out structurally on
WDQS/Blazegraph while QLever answers it in sub-second time, and each WDQS
timeout costs the full client timeout per offset before falling through.

Inverse resolution: an explicit P1696 (inverse property) statement wins;
otherwise the inverse constraint (Q21510855, qualifier P2306) is used.

Closed ancestors (atlas spec §3.3.3 item 3): property documents carry only
DIRECT P1647 parents; the full closure for every item-property is fetched
in ONE QLever query (0.3 s, 833 pairs live) and merged per record as
direct parents (document order) first, then the remaining closure members
in numeric-PID order. Cycle-safe (self and duplicates dropped).

Example selection lives in ``examples.py`` (stratified by subject-type
constraint class, sitelink-weighted, endpoint-deduplicated). Under
stratification, untyped candidates are dropped (live-verified motivation:
reversed statements in the long tail, e.g. Q100151929, a person with EMPTY
P31, as the SUBJECT of P6) and typed candidates matching no constraint
class land in the diagnostic ``other`` bucket. Properties without
constraints keep every candidate, typed or not.
"""

import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field, JsonValue, ValidationError
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.common.provenance import canonical_json_bytes, sha256_bytes
from atlas_tools.wikidata.cache import RETRIEVED_AT_HEADER
from atlas_tools.wikidata.config import Config, ExtractionConfig
from atlas_tools.wikidata.examples import OTHER_WARNING_FRACTION, select_examples
from atlas_tools.wikidata.model import (
    ConstraintKind,
    Constraints,
    EntityLabel,
    ExampleSource,
    Pid,
    PropertyRecord,
    pid_number,
)
from atlas_tools.wikidata.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.wikidata.sparql import (
    EXAMPLE_QUERY_VERSION,
    WIKIBASE_ITEM_DATATYPE,
    ExampleRow,
    InventoryRow,
    example_pairs_query,
    parse_ancestor_results,
    parse_example_results,
    parse_inventory_results,
    property_ancestors_query,
    property_inventory_query,
    sparql_params,
)
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import Transport

WBGETENTITIES_BATCH_SIZE = 50

_QUALIFIER_CLASS = "P2308"
_QUALIFIER_PROPERTY = "P2306"


class EntityIdValue(BaseModel):
    """An entity-id snak datavalue payload (``{"id": "Q5", ...}``)."""

    id: str


class SnakDataValue(BaseModel):
    # Entity-id payloads are modelled; everything else (strings, times,
    # quantities) is opaque JSON this tool never reads. Left-to-right union
    # mode: smart mode would keep an id-carrying dict as plain JSON instead
    # of coercing it into EntityIdValue.
    value: EntityIdValue | JsonValue = Field(default=None, union_mode="left_to_right")


class Snak(BaseModel):
    snaktype: str = ""
    datavalue: SnakDataValue | None = None


class Statement(BaseModel):
    mainsnak: Snak = Field(default_factory=Snak)
    qualifiers: dict[str, list[Snak]] = Field(default_factory=dict)


class TermValue(BaseModel):
    """A label/description/alias entry (``{"language": .., "value": ..}``)."""

    language: str = ""
    value: str


class EntityDocument(BaseModel):
    """The subset of a wbgetentities entity document this tool reads."""

    id: str
    datatype: str = ""
    labels: dict[str, TermValue] = Field(default_factory=dict)
    descriptions: dict[str, TermValue] = Field(default_factory=dict)
    aliases: dict[str, list[TermValue]] = Field(default_factory=dict)
    claims: dict[str, list[Statement]] = Field(default_factory=dict)


class WbGetEntitiesResponse(BaseModel):
    entities: dict[str, EntityDocument] = Field(default_factory=dict)


def _snak_entity_id(snak: Snak) -> str | None:
    if snak.snaktype != "value" or snak.datavalue is None:
        return None
    value = snak.datavalue.value
    return value.id if isinstance(value, EntityIdValue) else None


def _statement_entity_ids(
    claims: Mapping[str, Sequence[Statement]], claim_property: str
) -> tuple[str, ...]:
    ids: list[str] = []
    for statement in claims.get(claim_property, ()):
        entity_id = _snak_entity_id(statement.mainsnak)
        if entity_id is not None and entity_id not in ids:
            ids.append(entity_id)
    return tuple(ids)


def _qualifier_entity_ids(statement: Statement, qualifier: str) -> tuple[str, ...]:
    ids: list[str] = []
    for snak in statement.qualifiers.get(qualifier, ()):
        entity_id = _snak_entity_id(snak)
        if entity_id is not None and entity_id not in ids:
            ids.append(entity_id)
    return tuple(ids)


def parse_constraints(p2302_statements: Sequence[Statement]) -> Constraints:
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
        type_qid = _snak_entity_id(statement.mainsnak)
        if type_qid is None:
            continue
        try:
            kind = ConstraintKind(type_qid)
        except ValueError:
            if type_qid not in ignored:
                ignored.append(type_qid)
            continue
        match kind:
            case ConstraintKind.SYMMETRIC:
                symmetric = True
            case ConstraintKind.TRANSITIVE:
                transitive = True
            case ConstraintKind.SINGLE_VALUE:
                single_value = True
            case ConstraintKind.DISTINCT_VALUES:
                distinct_values = True
            case ConstraintKind.SUBJECT_TYPE:
                for qid in _qualifier_entity_ids(statement, _QUALIFIER_CLASS):
                    if qid not in subject_types:
                        subject_types.append(qid)
            case ConstraintKind.VALUE_TYPE:
                for qid in _qualifier_entity_ids(statement, _QUALIFIER_CLASS):
                    if qid not in value_types:
                        value_types.append(qid)
            case ConstraintKind.INVERSE:
                pids = _qualifier_entity_ids(statement, _QUALIFIER_PROPERTY)
                if pids and inverse_pid is None:
                    inverse_pid = pids[0]

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
    document: EntityDocument, languages: tuple[LanguageAlpha2, ...]
) -> PropertyRecord:
    """Build a PropertyRecord (sans examples/usage) from a wbgetentities doc."""
    constraints = parse_constraints(document.claims.get("P2302", []))
    p1696 = _statement_entity_ids(document.claims, "P1696")
    inverse_pid = p1696[0] if p1696 else constraints.inverse_pid
    return PropertyRecord(
        pid=document.id,
        datatype=document.datatype,
        labels={
            language: document.labels[language].value
            for language in languages
            if language in document.labels
        },
        descriptions={
            language: document.descriptions[language].value
            for language in languages
            if language in document.descriptions
        },
        aliases={
            language: [entry.value for entry in document.aliases[language]]
            for language in languages
            if document.aliases.get(language)
        },
        p31=_statement_entity_ids(document.claims, "P31"),
        ancestors=_statement_entity_ids(document.claims, "P1647"),
        inverse_pid=inverse_pid,
        constraints=constraints,
    )


def exclusion_reason(
    record: PropertyRecord, extraction: ExtractionConfig
) -> str | None:
    """First matching exclusion rule, or None if the property is retained."""
    if record.datatype != "wikibase-item":
        return f"datatype:{record.datatype}"
    p31 = set(record.p31)
    if p31 & set(extraction.maintenance_classes):
        return "maintenance"
    if p31 & set(extraction.deprecated_classes):
        return "deprecated"
    return None


def chunk_ids[IdT: str](
    ids: Sequence[IdT], size: int = WBGETENTITIES_BATCH_SIZE
) -> list[list[IdT]]:
    """Numeric-sorted ids in fixed-size chunks (deterministic batching).

    The tiebreak on the full id keeps mixed P/Q batches deterministic
    (P50 and Q50 share the numeric key 50).
    """
    ordered = sorted(ids, key=lambda entity_id: (pid_number(entity_id), entity_id))
    return [ordered[i : i + size] for i in range(0, len(ordered), size)]


def wbgetentities_params(
    ids: Sequence[str], languages: tuple[LanguageAlpha2, ...]
) -> dict[str, str]:
    return {
        "action": "wbgetentities",
        "format": "json",
        "ids": "|".join(ids),
        "props": "labels|descriptions|aliases|claims|datatype",
        "languages": "|".join(languages),
    }


def merge_closed_ancestors(
    record: PropertyRecord, closure: Mapping[Pid, tuple[Pid, ...]]
) -> tuple[Pid, ...]:
    """CLOSED ancestor set for one record (atlas spec §3.3.3 item 3).

    Direct P1647 parents keep their document order and come first; the
    remaining closure members follow in numeric-PID order. The record's own
    PID and duplicates are dropped, which also makes P1647 cycles safe.
    """
    direct = record.ancestors
    closure_members = set(closure.get(record.pid, ())) - set(direct) - {record.pid}
    return direct + tuple(sorted(closure_members, key=pid_number))


@dataclass(frozen=True)
class LadderSuccess:
    """One endpoint of the ladder produced example rows."""

    source: ExampleSource
    rows: tuple[ExampleRow, ...]


@dataclass(frozen=True)
class LadderSkip:
    """Every endpoint of the ladder failed; the property records a skip."""


type LadderOutcome = LadderSuccess | LadderSkip


def fetch_example_rows(
    pid: str,
    extraction: ExtractionConfig,
    transport: Transport,
    *,
    endpoints: tuple[ExampleSource, ...] | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> LadderOutcome:
    """Run the fallback ladder; ``endpoints`` defaults to the configured
    ``extraction.example_endpoint_ladder`` (checkpoint replay narrows it)."""
    if endpoints is None:
        endpoints = extraction.example_endpoint_ladder
    for endpoint in endpoints:
        url = extraction.endpoints.sparql_url(endpoint)
        rows: list[ExampleRow] = []
        endpoint_ok = True
        for offset in extraction.example_offsets:
            query = example_pairs_query(
                pid,
                limit=extraction.example_pool_limit,
                offset=offset,
                language=extraction.primary_language,
            )
            response = transport.get(url, sparql_params(query))
            if not response.ok:
                progress.note(
                    f"{pid}: {endpoint} example query failed (status {response.status})"
                )
                endpoint_ok = False
                break
            rows.extend(parse_example_results(response.body))
        if endpoint_ok:
            return LadderSuccess(source=endpoint, rows=tuple(rows))
    return LadderSkip()


class ExtractionResult(BaseModel):
    records: list[PropertyRecord]  # retained, numeric-PID order
    inventory_rows: list[InventoryRow]
    excluded: dict[str, str]  # pid -> exclusion reason
    entity_labels: dict[Pid, EntityLabel]
    example_fallbacks: dict[str, ExampleSource]  # pid -> rescuing endpoint
    example_skips: list[str]  # pids where the whole ladder failed
    # pid -> untyped candidates dropped under stratification (the
    # reversed-statement guard; diagnostics).
    example_filtered: dict[str, int] = Field(default_factory=dict)
    # pid -> typed candidates matching no subject-type constraint class
    # (the `other` bucket; a persistently large value means the constraint
    # list is stale).
    example_other: dict[str, int] = Field(default_factory=dict)
    # pids where every constraint stratum was empty and examples fell back
    # to the `other` pool.
    example_other_fallbacks: list[str] = Field(default_factory=list)
    api_snapshot_date: str = ""


class ExtractionCheckpointState(BaseModel):
    """On-disk shape of the property-level progress checkpoint."""

    config_hash: str
    examples_done: dict[str, ExampleSource | None] = Field(default_factory=dict)


class ExtractionCheckpoint:
    """Property-level progress checkpoint (JSON, atomic writes).

    Records the example-ladder outcome per PID so a rerun replays recorded
    outcomes (fetching through the response cache) instead of re-probing
    endpoints. A checkpoint whose config_hash differs from the current
    config is discarded, as is an unreadable one. Combined with the response
    cache this makes rerun-after-kill idempotent.
    """

    def __init__(self, path: Path, config_hash: str) -> None:
        self.path = path
        self._state = ExtractionCheckpointState(config_hash=config_hash)
        if path.exists():
            try:
                loaded = ExtractionCheckpointState.model_validate_json(
                    path.read_bytes()
                )
            except ValidationError:
                loaded = None
            if loaded is not None and loaded.config_hash == config_hash:
                self._state = loaded

    @property
    def examples_done(self) -> Mapping[str, ExampleSource | None]:
        return self._state.examples_done

    def record_example(self, pid: str, source: ExampleSource | None) -> None:
        self._state.examples_done[pid] = source
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.name + ".tmp")
        tmp.write_text(
            self._state.model_dump_json(indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(tmp, self.path)


def extraction_config_hash(config: Config) -> str:
    """Checkpoint guard hash: extraction sub-config + example-query version.

    Card-format-independent. Including :data:`EXAMPLE_QUERY_VERSION` means a
    semantic query fix discards recorded ladder outcomes instead of
    replaying results of the old, possibly-broken query.
    """
    return sha256_bytes(
        canonical_json_bytes(
            {
                "extraction": config.extraction.model_dump(mode="json"),
                "example_query_version": EXAMPLE_QUERY_VERSION,
            }
        )
    )


def extract_properties(
    config: Config,
    transport: Transport,
    *,
    taxonomy: Taxonomy | None = None,
    checkpoint_path: Path | str | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> ExtractionResult:
    """Full W2a extraction: inventory -> ancestors closure -> documents ->
    exclusions -> labels -> example ladder. All HTTP goes through
    ``transport``; wrap it in a ``CachingTransport`` for warm-cache reruns
    with zero network calls. ``taxonomy`` is required whenever the
    subject-type example filter is enabled."""
    extraction = config.extraction
    if extraction.filter_examples_by_subject_type and taxonomy is None:
        raise RuntimeError(
            "subject-type example filtering is enabled"
            " (extraction.filter_examples_by_subject_type) but no taxonomy was"
            " provided; build one with `wikidata taxonomy --config … --out"
            " taxonomy.parquet --checkpoint …` and pass it via --taxonomy"
            " (or disable the filter)"
        )

    checkpoint = (
        ExtractionCheckpoint(Path(checkpoint_path), extraction_config_hash(config))
        if checkpoint_path is not None
        else None
    )

    # 1. Property inventory via SPARQL.
    progress.phase("property inventory (SPARQL)")
    response = transport.get(
        extraction.endpoints.wdqs, sparql_params(property_inventory_query())
    )
    if not response.ok:
        raise RuntimeError(
            f"property inventory query failed with status {response.status}"
        )

    inventory_rows = parse_inventory_results(response.body)

    excluded: dict[str, str] = {}
    retained_pids: list[Pid] = []
    usage_by_pid: dict[str, int | None] = {}

    for row in inventory_rows:
        usage_by_pid[row.pid] = row.usage
        if row.datatype_uri != WIKIBASE_ITEM_DATATYPE:
            excluded[row.pid] = f"datatype:{row.datatype_uri.rsplit('#', 1)[-1]}"
        else:
            retained_pids.append(Pid(row.pid))

    # 1b. P1647 ancestor CLOSURE for all item-properties, one small query
    # (goes through the cache, unlike taxonomy pages).
    response = transport.get(
        extraction.endpoints.qlever, sparql_params(property_ancestors_query())
    )
    if not response.ok:
        raise RuntimeError(
            f"property ancestors query failed with status {response.status}"
        )

    ancestor_closure: dict[Pid, tuple[Pid, ...]] = {}
    for property_pid, ancestor_pid in parse_ancestor_results(response.body):
        ancestor_closure[property_pid] = ancestor_closure.get(property_pid, ()) + (
            ancestor_pid,
        )

    # 2. Full property documents via wbgetentities, batches of 50.
    progress.note(
        f"{len(inventory_rows)} properties in inventory,"
        f" {len(retained_pids)} entity-valued retained"
    )
    property_batches = chunk_ids(retained_pids)
    progress.phase("property documents (wbgetentities)", total=len(property_batches))
    records: list[PropertyRecord] = []

    for batch in property_batches:
        response = transport.get(
            extraction.endpoints.wikibase_api,
            wbgetentities_params(batch, extraction.languages),
        )

        if not response.ok:
            raise RuntimeError(
                f"wbgetentities batch failed with status {response.status}"
            )

        retrieved_at = response.headers.get(
            RETRIEVED_AT_HEADER
        ) or response.headers.get("date")
        documents = WbGetEntitiesResponse.model_validate_json(response.body)

        for pid in batch:
            document = documents.entities.get(pid)
            if document is None:
                excluded[pid] = "missing-document"
                continue
            record = parse_property_document(document, extraction.languages)
            record.usage_count = usage_by_pid.get(pid)
            record.retrieved_at = retrieved_at
            record.ancestors = merge_closed_ancestors(record, ancestor_closure)
            reason = exclusion_reason(record, extraction)
            if reason is not None:
                excluded[pid] = reason
            else:
                records.append(record)

        progress.advance()

    records.sort(key=lambda record: pid_number(record.pid))

    # 3. Labels/descriptions for referenced items (endpoint types) so cards
    # can render titles+descriptions. Property labels come from step 2.
    entity_labels: dict[Pid, EntityLabel] = {}
    primary = extraction.primary_language
    for record in records:
        entity_labels[record.pid] = EntityLabel(
            label=record.labels.get(primary, ""),
            description=record.descriptions.get(primary, ""),
        )

    # Endpoint-type QIDs plus closed-ancestor PIDs that are not retained
    # properties (their labels are not in entity_labels yet).
    referenced_ids = {
        qid
        for record in records
        for qid in record.constraints.subject_types + record.constraints.value_types
    } | {
        ancestor
        for record in records
        for ancestor in record.ancestors
        if ancestor not in entity_labels
    }

    label_batches = chunk_ids(list(referenced_ids))
    progress.phase("entity labels (wbgetentities)", total=len(label_batches))

    for batch in label_batches:
        response = transport.get(
            extraction.endpoints.wikibase_api,
            wbgetentities_params(batch, extraction.languages),
        )

        if not response.ok:
            raise RuntimeError(
                f"wbgetentities item batch failed with status {response.status}"
            )

        documents = WbGetEntitiesResponse.model_validate_json(response.body)
        for qid in batch:
            document = documents.entities.get(qid)
            if document is None:
                entity_labels[qid] = EntityLabel()
                continue
            label = document.labels.get(primary)
            description = document.descriptions.get(primary)
            entity_labels[qid] = EntityLabel(
                label=label.value if label else "",
                description=description.value if description else "",
            )
        progress.advance()

    # 4. Example ladder per retained property.
    progress.phase("example ladder (per property)", total=len(records))
    if checkpoint is not None and checkpoint.examples_done:
        progress.note(
            f"resuming: {len(checkpoint.examples_done)} example outcomes"
            " replayed from checkpoint"
        )

    example_fallbacks: dict[str, ExampleSource] = {}
    example_skips: list[str] = []
    example_filtered: dict[str, int] = {}
    example_other: dict[str, int] = {}
    example_other_fallbacks: list[str] = []

    for record in records:
        if checkpoint is not None and record.pid in checkpoint.examples_done:
            replay_source = checkpoint.examples_done[record.pid]
            endpoints: tuple[ExampleSource, ...] = (
                (replay_source,) if replay_source is not None else ()
            )
        else:
            endpoints = extraction.example_endpoint_ladder

        outcome: LadderOutcome = LadderSkip()

        if endpoints:
            outcome = fetch_example_rows(
                record.pid,
                extraction,
                transport,
                endpoints=endpoints,
                progress=progress,
            )

        match outcome:
            case LadderSuccess(source=source, rows=rows):
                record.example_source = source
                if source != extraction.example_endpoint_ladder[0]:
                    example_fallbacks[record.pid] = source
                selection = select_examples(
                    rows,
                    constraint_classes=record.constraints.subject_types,
                    taxonomy=(
                        taxonomy if extraction.filter_examples_by_subject_type else None
                    ),
                    count=extraction.example_count,
                    seed=extraction.seed,
                    pid=record.pid,
                )

                record.examples = selection.examples

                if selection.untyped_dropped:
                    example_filtered[record.pid] = selection.untyped_dropped
                    progress.note(
                        f"{record.pid}: {selection.untyped_dropped} untyped"
                        " candidates dropped (reversed-statement guard)"
                    )

                if selection.other_candidates:
                    example_other[record.pid] = selection.other_candidates

                if selection.other_used:
                    example_other_fallbacks.append(record.pid)
                    progress.note(
                        f"{record.pid}: every subject-type constraint stratum"
                        " is empty; examples fell back to the `other` pool"
                    )
                elif selection.other_fraction > OTHER_WARNING_FRACTION:
                    progress.note(
                        f"{record.pid}: {selection.other_candidates} of"
                        f" {selection.candidates} candidates match no"
                        " subject-type constraint class — the constraint list"
                        " may be stale"
                    )

            case LadderSkip():
                record.example_skipped = True
                example_skips.append(record.pid)
                progress.note(f"{record.pid}: example ladder exhausted, skipped")

        if checkpoint is not None:
            checkpoint.record_example(record.pid, record.example_source)

        progress.advance()

    return ExtractionResult(
        records=records,
        inventory_rows=inventory_rows,
        excluded=excluded,
        entity_labels=entity_labels,
        example_fallbacks=example_fallbacks,
        example_skips=example_skips,
        example_filtered=example_filtered,
        example_other=example_other,
        example_other_fallbacks=example_other_fallbacks,
        api_snapshot_date=extraction.snapshot_date,
    )
