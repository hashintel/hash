"""Property mining: inventory, wbgetentities batching, P2302 parsing, example ladder.

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

Every other constraint type (format, allowed-qualifiers, citation-needed,
property-scope, allowed-units, one-of, none-of, contemporary, integer, range,
and so on) is ignored; the ignored type QIDs are recorded in
``Constraints.ignored_types`` and never affect output.

Exclusion rules (configurable; applied in this order, first match wins)
-----------------------------------------------------------------------
1. ``datatype:<datatype>``: the datatype is not ``wikibase-item``. The
   inventory SPARQL query already restricts to wikibase-item, but the parser
   defensively re-filters so external-identifier properties (P212-style)
   can never leak through.
2. ``maintenance``: the property's P31 intersects
   ``extraction.maintenance_classes`` (Q18644435-style "Wikidata property
   for Wikimedia" classes).
3. ``deprecated``: the property's P31 intersects
   ``extraction.deprecated_classes`` (Q18644427-style obsolete-property
   classes; this is the owl:deprecated proxy available in entity documents).

Example fallback ladder
-----------------------
Endpoints are tried in ``extraction.example_endpoint_ladder`` order (QLever
first by default, then WDQS); when every rung fails the property records a
skip. The outcome is a :data:`LadderOutcome`: a ``LadderSuccess`` tagged
with its source endpoint, or a ``LadderSkip``. ``example_fallbacks``
records every property that the first rung did not serve. An endpoint
fails for a property when any of its offset requests returns a non-200
status (``RequestsTransport`` has already retried with backoff by then).
Failures are cached like successes, so a warm-cache rerun makes zero
network calls even for failing properties.

The QLever-first ladder order is evidence-based: the deep-offset subquery
form (see sparql.py) times out structurally on WDQS/Blazegraph while
QLever answers it in sub-second time, and each WDQS timeout costs the full
client timeout per offset before the ladder can fall through.

Inverse resolution: an explicit P1696 (inverse property) statement wins;
otherwise the inverse constraint (Q21510855, qualifier P2306) is used.

Closed ancestors: cards carry the full P1647 subproperty closure rather
than only direct parents, so a card states every generalization of the
relation. Property documents list direct parents only; the closure for
every item-property is fetched in one QLever query (0.3 s, 833 pairs
measured live) and merged per record as direct parents (document order)
first, then the remaining closure members in numeric-PID order. The merge
is cycle-safe: the record's own PID and duplicates are dropped.

Example selection lives in ``examples.py`` (stratified by subject-type
constraint class, sitelink-weighted, endpoint-deduplicated). Under
stratification, untyped candidates are dropped; the motivation is
live-verified: the long tail contains reversed statements, for example
Q100151929, a person with an empty P31, appearing as the subject of P6.
Typed candidates matching no constraint class land in the diagnostic
``other`` bucket. Properties without constraints keep every candidate,
typed or not.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
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
    EntityId,
    EntityLabel,
    ExampleSource,
    Pid,
    PropertyRecord,
    Qid,
    entity_number,
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


def _qualifier_class_qids(statement: Statement) -> tuple[Qid, ...]:
    """P2308 class qualifiers, branded at the parse boundary."""
    return tuple(Qid(entity_id) for entity_id in _qualifier_entity_ids(statement, _QUALIFIER_CLASS))


def _extend_unique[IdT: str](target: list[IdT], entity_ids: tuple[IdT, ...]) -> None:
    for entity_id in entity_ids:
        if entity_id not in target:
            target.append(entity_id)


@dataclass
class _ConstraintsInProgress:
    """Mutable accumulator for one property's P2302 statements."""

    symmetric: bool = False
    transitive: bool = False
    single_value: bool = False
    distinct_values: bool = False
    subject_types: list[Qid] = field(default_factory=list)
    value_types: list[Qid] = field(default_factory=list)
    inverse_pid: Pid | None = None
    ignored: list[str] = field(default_factory=list)

    def apply(self, kind: ConstraintKind, statement: Statement) -> None:
        match kind:
            case ConstraintKind.SYMMETRIC:
                self.symmetric = True
            case ConstraintKind.TRANSITIVE:
                self.transitive = True
            case ConstraintKind.SINGLE_VALUE:
                self.single_value = True
            case ConstraintKind.DISTINCT_VALUES:
                self.distinct_values = True
            case ConstraintKind.SUBJECT_TYPE:
                _extend_unique(self.subject_types, _qualifier_class_qids(statement))
            case ConstraintKind.VALUE_TYPE:
                _extend_unique(self.value_types, _qualifier_class_qids(statement))
            case ConstraintKind.INVERSE:
                pids = _qualifier_entity_ids(statement, _QUALIFIER_PROPERTY)
                if pids and self.inverse_pid is None:
                    self.inverse_pid = Pid(pids[0])

    def build(self) -> Constraints:
        return Constraints(
            symmetric=self.symmetric,
            transitive=self.transitive,
            single_value=self.single_value,
            distinct_values=self.distinct_values,
            subject_types=tuple(self.subject_types),
            value_types=tuple(self.value_types),
            inverse_pid=self.inverse_pid,
            ignored_types=tuple(self.ignored),
        )


def parse_constraints(p2302_statements: Sequence[Statement]) -> Constraints:
    """Parse the P2302 statements of one property.

    The parse scope is documented in the module docstring. Unknown
    constraint types are ignored without error and recorded in
    ``ignored_types`` (deduplicated, statement order preserved).
    """
    accumulator = _ConstraintsInProgress()
    for statement in p2302_statements:
        type_qid = _snak_entity_id(statement.mainsnak)
        if type_qid is None:
            continue
        try:
            kind = ConstraintKind(type_qid)
        except ValueError:
            if type_qid not in accumulator.ignored:
                accumulator.ignored.append(type_qid)
            continue
        accumulator.apply(kind, statement)
    return accumulator.build()


def parse_property_document(
    document: EntityDocument, languages: tuple[LanguageAlpha2, ...]
) -> PropertyRecord:
    """Build a :class:`PropertyRecord` from one wbgetentities entity document.

    Usage, examples, and retrieval metadata are filled in by later
    extraction phases.
    """
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


def exclusion_reason(record: PropertyRecord, extraction: ExtractionConfig) -> str | None:
    """Return the first matching exclusion rule, or None when the property is retained."""
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
    """Chunk ids into fixed-size batches in deterministic numeric order.

    The tiebreak on the full id keeps mixed P/Q batches deterministic
    (P50 and Q50 share the numeric key 50).
    """
    ordered = sorted(ids, key=lambda entity_id: (entity_number(entity_id), entity_id))
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
    """Merge a record's direct parents with the fetched ancestor closure.

    Cards carry the full subproperty closure rather than only direct
    parents, so a card states every generalization of the relation. Direct
    P1647 parents keep their document order and come first; the remaining
    closure members follow in numeric-PID order. The record's own PID and
    duplicates are dropped, which also makes P1647 cycles safe.
    """
    direct = record.ancestors
    closure_members = set(closure.get(record.pid, ())) - set(direct) - {record.pid}
    return direct + tuple(sorted(closure_members, key=entity_number))


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
    """Run the example fallback ladder for one property.

    ``endpoints`` defaults to the configured
    ``extraction.example_endpoint_ladder``; checkpoint replay passes a
    narrowed tuple instead.
    """
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
                progress.note(f"{pid}: {endpoint} example query failed (status {response.status})")
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
    entity_labels: dict[EntityId, EntityLabel]
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
                loaded = ExtractionCheckpointState.model_validate_json(path.read_bytes())
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
        tmp.replace(self.path)


def extraction_config_hash(config: Config) -> str:
    """Hash the extraction sub-config plus the example-query version.

    This is the checkpoint guard hash, and it is card-format-independent.
    Including :data:`EXAMPLE_QUERY_VERSION` means a semantic query fix
    discards recorded ladder outcomes instead of replaying results of the
    old, possibly-broken query.
    """
    return sha256_bytes(
        canonical_json_bytes(
            {
                "extraction": config.extraction.model_dump(mode="json"),
                "example_query_version": EXAMPLE_QUERY_VERSION,
            }
        )
    )


@dataclass
class _Inventory:
    """Partitioned inventory: raw rows, exclusions so far, and retained PIDs."""

    rows: list[InventoryRow]
    excluded: dict[str, str]
    retained_pids: list[Pid]
    usage_by_pid: dict[str, int | None]


def _fetch_inventory(
    extraction: ExtractionConfig, transport: Transport, progress: ProgressReporter
) -> _Inventory:
    """Fetch the property inventory and partition it by datatype."""
    progress.phase("property inventory (SPARQL)")
    response = transport.get(extraction.endpoints.wdqs, sparql_params(property_inventory_query()))
    if not response.ok:
        raise RuntimeError(f"property inventory query failed with status {response.status}")

    rows = parse_inventory_results(response.body)
    excluded: dict[str, str] = {}
    retained_pids: list[Pid] = []
    usage_by_pid: dict[str, int | None] = {}
    for row in rows:
        usage_by_pid[row.pid] = row.usage
        if row.datatype_uri != WIKIBASE_ITEM_DATATYPE:
            excluded[row.pid] = f"datatype:{row.datatype_uri.rsplit('#', 1)[-1]}"
        else:
            retained_pids.append(Pid(row.pid))
    return _Inventory(
        rows=rows,
        excluded=excluded,
        retained_pids=retained_pids,
        usage_by_pid=usage_by_pid,
    )


def _fetch_ancestor_closure(
    extraction: ExtractionConfig, transport: Transport
) -> dict[Pid, tuple[Pid, ...]]:
    """Fetch the P1647 ancestor closure for all item-properties in one query.

    The response is small (833 pairs measured live), so unlike taxonomy
    pages it goes through the response cache.
    """
    response = transport.get(extraction.endpoints.qlever, sparql_params(property_ancestors_query()))
    if not response.ok:
        raise RuntimeError(f"property ancestors query failed with status {response.status}")

    closure: dict[Pid, list[Pid]] = {}
    for property_pid, ancestor_pid in parse_ancestor_results(response.body):
        closure.setdefault(property_pid, []).append(ancestor_pid)
    return {pid: tuple(ancestors) for pid, ancestors in closure.items()}


def _fetch_property_records(
    inventory: _Inventory,
    ancestor_closure: Mapping[Pid, tuple[Pid, ...]],
    extraction: ExtractionConfig,
    transport: Transport,
    progress: ProgressReporter,
) -> list[PropertyRecord]:
    """Fetch full property documents in batches and parse the retained ones.

    Exclusions found at the document level (missing document, datatype,
    maintenance, deprecated) are recorded in ``inventory.excluded``. The
    returned records are sorted by numeric PID.
    """
    progress.note(
        f"{len(inventory.rows)} properties in inventory,"
        f" {len(inventory.retained_pids)} entity-valued retained"
    )
    property_batches = chunk_ids(inventory.retained_pids)
    progress.phase("property documents (wbgetentities)", total=len(property_batches))
    records: list[PropertyRecord] = []

    for batch in property_batches:
        response = transport.get(
            extraction.endpoints.wikibase_api,
            wbgetentities_params(batch, extraction.languages),
        )

        if not response.ok:
            raise RuntimeError(f"wbgetentities batch failed with status {response.status}")

        retrieved_at = response.headers.get(RETRIEVED_AT_HEADER) or response.headers.get("date")
        documents = WbGetEntitiesResponse.model_validate_json(response.body)

        for pid in batch:
            document = documents.entities.get(pid)
            if document is None:
                inventory.excluded[pid] = "missing-document"
                continue
            record = parse_property_document(document, extraction.languages)
            record.usage_count = inventory.usage_by_pid.get(pid)
            record.retrieved_at = retrieved_at
            record.ancestors = merge_closed_ancestors(record, ancestor_closure)
            reason = exclusion_reason(record, extraction)
            if reason is not None:
                inventory.excluded[pid] = reason
            else:
                records.append(record)

        progress.advance()

    records.sort(key=lambda record: entity_number(record.pid))
    return records


def _collect_entity_labels(
    records: Sequence[PropertyRecord],
    extraction: ExtractionConfig,
    transport: Transport,
    progress: ProgressReporter,
) -> dict[EntityId, EntityLabel]:
    """Resolve labels and descriptions for every entity a card references.

    Retained properties are covered by their own documents; the remaining
    references (endpoint-type QIDs, plus closed-ancestor PIDs that are not
    retained properties) are fetched in wbgetentities batches so cards can
    render titles and descriptions for them.
    """
    entity_labels: dict[EntityId, EntityLabel] = {}
    primary = extraction.primary_language
    for record in records:
        entity_labels[record.pid] = EntityLabel(
            label=record.labels.get(primary, ""),
            description=record.descriptions.get(primary, ""),
        )

    referenced_ids: set[EntityId] = {
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
            raise RuntimeError(f"wbgetentities item batch failed with status {response.status}")

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

    return entity_labels


@dataclass
class _LadderDiagnostics:
    """Per-run example-ladder outcomes, mirrored into :class:`ExtractionResult`."""

    fallbacks: dict[str, ExampleSource] = field(default_factory=dict)
    skips: list[str] = field(default_factory=list)
    filtered: dict[str, int] = field(default_factory=dict)
    other: dict[str, int] = field(default_factory=dict)
    other_fallbacks: list[str] = field(default_factory=list)


def _replay_endpoints(
    checkpoint: ExtractionCheckpoint | None, pid: str, extraction: ExtractionConfig
) -> tuple[ExampleSource, ...]:
    """Choose the endpoints to probe for one property.

    A checkpointed outcome narrows the ladder to the recorded endpoint (or
    to nothing for a recorded skip), so a rerun replays results through the
    response cache instead of re-probing.
    """
    if checkpoint is not None and pid in checkpoint.examples_done:
        replay_source = checkpoint.examples_done[pid]
        return (replay_source,) if replay_source is not None else ()
    return extraction.example_endpoint_ladder


def _apply_ladder_success(
    record: PropertyRecord,
    source: ExampleSource,
    rows: tuple[ExampleRow, ...],
    extraction: ExtractionConfig,
    taxonomy: Taxonomy | None,
    diagnostics: _LadderDiagnostics,
    progress: ProgressReporter,
) -> None:
    """Select examples from fetched rows and record the selection diagnostics."""
    record.example_source = source
    if source != extraction.example_endpoint_ladder[0]:
        diagnostics.fallbacks[record.pid] = source
    selection = select_examples(
        rows,
        constraint_classes=record.constraints.subject_types,
        taxonomy=taxonomy,
        count=extraction.example_count,
    )

    record.examples = selection.examples

    if selection.untyped_dropped:
        diagnostics.filtered[record.pid] = selection.untyped_dropped
        progress.note(
            f"{record.pid}: {selection.untyped_dropped} untyped"
            " candidates dropped (reversed-statement guard)"
        )

    if selection.other_candidates:
        diagnostics.other[record.pid] = selection.other_candidates

    if selection.other_used:
        diagnostics.other_fallbacks.append(record.pid)
        progress.note(
            f"{record.pid}: every subject-type constraint stratum"
            " is empty; examples fell back to the `other` pool"
        )
    elif selection.other_fraction > OTHER_WARNING_FRACTION:
        progress.note(
            f"{record.pid}: {selection.other_candidates} of"
            f" {selection.candidates} candidates match no"
            " subject-type constraint class; the constraint list"
            " may be stale"
        )

    if (dominant := selection.dominant_stratum) is not None:
        stratum, fraction = dominant
        progress.note(
            f"{record.pid}: stratum {stratum} holds {fraction:.0%} of the"
            " assigned candidates; the constraint ontology is coarser than"
            " the property's extension"
        )


def _mine_examples(
    records: Sequence[PropertyRecord],
    extraction: ExtractionConfig,
    transport: Transport,
    taxonomy: Taxonomy | None,
    checkpoint: ExtractionCheckpoint | None,
    progress: ProgressReporter,
) -> _LadderDiagnostics:
    """Run the example ladder for every retained property."""
    progress.phase("example ladder (per property)", total=len(records))
    if checkpoint is not None and checkpoint.examples_done:
        progress.note(
            f"resuming: {len(checkpoint.examples_done)} example outcomes replayed from checkpoint"
        )

    diagnostics = _LadderDiagnostics()
    for record in records:
        endpoints = _replay_endpoints(checkpoint, record.pid, extraction)

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
                _apply_ladder_success(
                    record, source, rows, extraction, taxonomy, diagnostics, progress
                )
            case LadderSkip():
                record.example_skipped = True
                diagnostics.skips.append(record.pid)
                progress.note(f"{record.pid}: example ladder exhausted, skipped")

        if checkpoint is not None:
            checkpoint.record_example(record.pid, record.example_source)

        progress.advance()

    return diagnostics


def extract_properties(
    config: Config,
    transport: Transport,
    *,
    taxonomy: Taxonomy | None = None,
    checkpoint_path: Path | str | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> ExtractionResult:
    """Mine property records through the full pipeline.

    Phases: inventory, ancestor closure, property documents, entity
    labels, example ladder. All HTTP goes through ``transport``; wrap it
    in a :class:`~atlas_tools.wikidata.cache.CachingTransport` for
    warm-cache reruns with zero network calls. ``taxonomy`` is required
    whenever the subject-type example filter is enabled.
    """
    extraction = config.extraction
    if extraction.filter_examples_by_subject_type and taxonomy is None:
        raise RuntimeError(
            "subject-type example filtering is enabled"
            " (extraction.filter_examples_by_subject_type) but no taxonomy was"
            " provided; build one with `wikidata taxonomy --config ... --out"
            " taxonomy.parquet --checkpoint ...` and pass it via --taxonomy"
            " (or disable the filter)"
        )

    checkpoint = (
        ExtractionCheckpoint(Path(checkpoint_path), extraction_config_hash(config))
        if checkpoint_path is not None
        else None
    )

    inventory = _fetch_inventory(extraction, transport, progress)
    ancestor_closure = _fetch_ancestor_closure(extraction, transport)
    records = _fetch_property_records(inventory, ancestor_closure, extraction, transport, progress)
    entity_labels = _collect_entity_labels(records, extraction, transport, progress)
    diagnostics = _mine_examples(
        records,
        extraction,
        transport,
        taxonomy if extraction.filter_examples_by_subject_type else None,
        checkpoint,
        progress,
    )

    return ExtractionResult(
        records=records,
        inventory_rows=inventory.rows,
        excluded=inventory.excluded,
        entity_labels=entity_labels,
        example_fallbacks=diagnostics.fallbacks,
        example_skips=diagnostics.skips,
        example_filtered=diagnostics.filtered,
        example_other=diagnostics.other,
        example_other_fallbacks=diagnostics.other_fallbacks,
        api_snapshot_date=extraction.snapshot_date,
    )
