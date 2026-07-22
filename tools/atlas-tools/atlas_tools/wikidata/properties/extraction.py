"""Property extraction orchestration and dependency-closed metadata loading.

Inverse resolution: every exact explicit P1696 (inverse property) ID is
preserved for source lineage. The first explicit ID wins for the singular
card display; only when P1696 is absent does that display fall back to the
inverse constraint (Q21510855, qualifier P2306). The fallback is never
promoted to a P1696 lineage fact.

Closed ancestors: exact direct P1647 IDs from property documents are
preserved separately for source lineage. Cards carry the full P1647
subproperty closure so a card states every generalization of the relation.
The closure for every item-property is fetched in one QLever query (0.3 s,
833 pairs measured live) and merged per record as direct parents (document
order) first, then the remaining closure members in numeric-PID order. The
merge is cycle-safe: the record's own PID and duplicates are dropped.

The extraction pipeline preserves deterministic ordering and routes every HTTP request
through the supplied transport so response caching and warm-cache behavior are unchanged.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from os import PathLike
from pathlib import Path
from typing import Self, cast

from pydantic import BaseModel, Field, ValidationError
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.wikidata.cache import RETRIEVED_AT_HEADER
from atlas_tools.wikidata.config import Config, ExtractionConfig
from atlas_tools.wikidata.model import (
    EntityId,
    EntityLabel,
    ExampleSource,
    Pid,
    PropertyLineage,
    PropertyRecord,
    entity_number,
)
from atlas_tools.wikidata.properties.documents import (
    EntityDocument,
    WbGetEntitiesResponse,
    chunk_ids,
    exclusion_reason,
    merge_closed_ancestors,
    parse_property_document,
    wbgetentities_params,
)
from atlas_tools.wikidata.properties.examples import (
    ExtractionCheckpoint,
    _mine_examples,
    extraction_config_hash,
)
from atlas_tools.wikidata.sparql import (
    WIKIBASE_ITEM_DATATYPE,
    InventoryRow,
    parse_ancestor_results,
    parse_inventory_results,
    property_ancestors_query,
    property_inventory_query,
    sparql_params,
)
from atlas_tools.wikidata.taxonomy import Taxonomy
from atlas_tools.wikidata.transport import Transport


class ExtractionResult(BaseModel):
    records: list[PropertyRecord]  # retained, numeric-PID order
    lineage: list[PropertyLineage]  # closed direct-fact source universe
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


@dataclass
class _PropertyDocuments:
    """Retained card records plus every property document already fetched."""

    records: list[PropertyRecord]
    by_pid: dict[Pid, PropertyRecord]


def _fetch_property_records(
    inventory: _Inventory,
    ancestor_closure: Mapping[Pid, tuple[Pid, ...]],
    extraction: ExtractionConfig,
    transport: Transport,
    progress: ProgressReporter,
) -> _PropertyDocuments:
    """Fetch property documents and retain direct facts even for excluded rows.

    Exclusions found at the document level (missing document, datatype,
    maintenance, deprecated) are recorded in ``inventory.excluded``. Card
    records are sorted by numeric PID; ``by_pid`` also keeps excluded source
    documents available when a retained relation references them.
    """
    progress.note(
        f"{len(inventory.rows)} properties in inventory,"
        f" {len(inventory.retained_pids)} entity-valued retained"
    )
    property_batches = chunk_ids(inventory.retained_pids)
    progress.phase("property documents (wbgetentities)", total=len(property_batches))
    records: list[PropertyRecord] = []
    by_pid: dict[Pid, PropertyRecord] = {}

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
            by_pid[record.pid] = record
            reason = exclusion_reason(record, extraction)
            if reason is not None:
                inventory.excluded[pid] = reason
            else:
                records.append(record)

        progress.advance()

    records.sort(key=lambda record: entity_number(record.pid))
    return _PropertyDocuments(records=records, by_pid=by_pid)


@dataclass(frozen=True)
class _EntityMetadata:
    """Card labels plus the complete direct-fact property universe."""

    labels: dict[EntityId, EntityLabel]
    lineage: list[PropertyLineage]


@dataclass
class _LineageClosure:
    """Expand exact direct property facts from selected cards to a closed universe."""

    documents: dict[Pid, PropertyRecord]
    frontier: set[Pid]
    included: set[Pid] = field(default_factory=set)

    @classmethod
    def for_records(
        cls,
        records: Sequence[PropertyRecord],
        documents: dict[Pid, PropertyRecord],
    ) -> Self:
        return cls(documents=documents, frontier={record.pid for record in records})

    def expand_known(self) -> set[Pid]:
        """Consume known documents and return property identities still unresolved."""
        unresolved: set[Pid] = set()
        while self.frontier:
            pid = min(self.frontier)
            self.frontier.remove(pid)
            if pid in self.included:
                continue
            record = self.documents.get(pid)
            if record is None:
                unresolved.add(pid)
                continue
            self.included.add(pid)
            self.frontier.update(record.direct_ancestors)
            self.frontier.update(record.p1696_inverse_pids)
        return unresolved

    def rows(self) -> list[PropertyLineage]:
        return [
            PropertyLineage(
                pid=pid,
                direct_ancestors=self.documents[pid].direct_ancestors,
                p1696_inverse_pids=self.documents[pid].p1696_inverse_pids,
            )
            for pid in sorted(self.included)
        ]


def _record_label(record: PropertyRecord, primary: LanguageAlpha2) -> EntityLabel:
    return EntityLabel(
        label=record.labels.get(primary, ""),
        description=record.descriptions.get(primary, ""),
    )


def _document_label(document: EntityDocument, primary: LanguageAlpha2) -> EntityLabel:
    label = document.labels.get(primary)
    description = document.descriptions.get(primary)
    return EntityLabel(
        label=label.value if label else "",
        description=description.value if description else "",
    )


def _display_references(records: Sequence[PropertyRecord]) -> set[EntityId]:
    return (
        {
            qid
            for record in records
            for qid in record.constraints.subject_types + record.constraints.value_types
        }
        | {ancestor for record in records for ancestor in record.ancestors}
        | {inverse_pid for record in records if (inverse_pid := record.inverse_pid) is not None}
    )


def _known_entity_labels(
    properties: _PropertyDocuments,
    display_references: set[EntityId],
    primary: LanguageAlpha2,
) -> dict[EntityId, EntityLabel]:
    labels: dict[EntityId, EntityLabel] = {
        record.pid: _record_label(record, primary) for record in properties.records
    }
    for entity_id in sorted(
        display_references,
        key=lambda value: (entity_number(value), value),
    ):
        record = properties.by_pid.get(cast("Pid", entity_id))
        if record is not None:
            labels[entity_id] = _record_label(record, primary)
    return labels


def _fetch_metadata_batch(
    batch: list[EntityId],
    *,
    unresolved: set[Pid],
    properties: _PropertyDocuments,
    entity_labels: dict[EntityId, EntityLabel],
    extraction: ExtractionConfig,
    transport: Transport,
) -> None:
    response = transport.get(
        extraction.endpoints.wikibase_api,
        wbgetentities_params(batch, extraction.languages),
    )
    if not response.ok:
        raise RuntimeError(f"wbgetentities entity batch failed with status {response.status}")

    documents = WbGetEntitiesResponse.model_validate_json(response.body)
    for entity_id in batch:
        document = documents.entities.get(entity_id)
        if document is None:
            if entity_id in unresolved:
                raise RuntimeError(f"lineage dependency {entity_id} has no property document")
            entity_labels[entity_id] = EntityLabel()
            continue

        entity_labels[entity_id] = _document_label(document, extraction.primary_language)
        if not entity_id.startswith("P") or not entity_id[1:].isdigit():
            continue
        try:
            property_document = parse_property_document(document, extraction.languages)
        except ValidationError:
            if entity_id in unresolved:
                raise
            continue
        if property_document.pid != entity_id:
            raise RuntimeError(
                f"property request {entity_id} returned property document {property_document.pid}"
            )
        properties.by_pid[property_document.pid] = property_document


def _collect_entity_metadata(
    properties: _PropertyDocuments,
    extraction: ExtractionConfig,
    transport: Transport,
    progress: ProgressReporter,
) -> _EntityMetadata:
    """Resolve card labels and close direct P1647/P1696 property dependencies.

    P2302/P2306 fallback IDs are fetched only when a card needs their display
    label. They never enter the lineage frontier. Every P1647 or P1696 target,
    including one absent from the retained inventory, is fetched and expanded
    until every direct edge resolves to a node.
    """
    display_references = _display_references(properties.records)
    entity_labels = _known_entity_labels(
        properties,
        display_references,
        extraction.primary_language,
    )
    closure = _LineageClosure.for_records(properties.records, properties.by_pid)
    unresolved = closure.expand_known()
    pending: set[EntityId] = unresolved | (display_references - entity_labels.keys())
    attempted: set[EntityId] = set()
    progress.phase("entity labels (wbgetentities)", total=len(chunk_ids(list(pending))))

    while pending:
        attempted.update(pending)
        for batch in chunk_ids(list(pending)):
            _fetch_metadata_batch(
                batch,
                unresolved=unresolved,
                properties=properties,
                entity_labels=entity_labels,
                extraction=extraction,
                transport=transport,
            )
            progress.advance()

        closure.frontier.update(unresolved)
        unresolved = closure.expand_known()
        pending = unresolved | ((display_references - entity_labels.keys()) - attempted)
        if unresolved and not pending:
            missing = ", ".join(sorted(unresolved))
            raise RuntimeError(f"lineage dependencies could not be resolved: {missing}")

    return _EntityMetadata(labels=entity_labels, lineage=closure.rows())


def extract_properties(
    config: Config,
    transport: Transport,
    *,
    taxonomy: Taxonomy | None = None,
    checkpoint_path: PathLike | None = None,
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
    properties = _fetch_property_records(
        inventory, ancestor_closure, extraction, transport, progress
    )
    metadata = _collect_entity_metadata(properties, extraction, transport, progress)
    records = properties.records
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
        lineage=metadata.lineage,
        inventory_rows=inventory.rows,
        excluded=inventory.excluded,
        entity_labels=metadata.labels,
        example_fallbacks=diagnostics.fallbacks,
        example_skips=diagnostics.skips,
        example_filtered=diagnostics.filtered,
        example_other=diagnostics.other,
        example_other_fallbacks=diagnostics.other_fallbacks,
        api_snapshot_date=extraction.snapshot_date,
    )
