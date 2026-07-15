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
- ``Q53869507`` property scope constraint    -> ``Constraints.scopes``
  (allowed placements from qualifier ``P5314``)

Every other constraint type (format, allowed-qualifiers, citation-needed,
allowed-units, one-of, none-of, contemporary, integer, range, and so on)
is ignored; the ignored type QIDs are recorded in
``Constraints.ignored_types`` and never affect output.

Exclusion rules (applied in this order, first match wins)
---------------------------------------------------------
1. ``datatype:<datatype>``: the datatype is not ``wikibase-item``. The
   inventory SPARQL query already restricts to wikibase-item, but the parser
   defensively re-filters so external-identifier properties (P212-style)
   can never leak through.
2. ``maintenance``: the property's P31 intersects
   ``extraction.maintenance_classes`` (Q18644435-style "Wikidata property
   for Wikimedia" classes; configurable).
3. ``deprecated``: the property's P31 intersects
   ``extraction.deprecated_classes`` (Q18644427-style obsolete-property
   classes; this is the owl:deprecated proxy available in entity documents;
   configurable).
4. ``qualifier-scoped``: the property declares a property-scope constraint
   (Q53869507) whose allowed placements (qualifier P5314) omit "as main
   value" (Q54828448). Such properties (P3831 "object has role", P4390
   "mapping relation type", P2553 "in work", and so on) are statement
   metadata, not entity-to-entity link types: any truthy main-value
   statements they carry are edits that misuse the property, so mined
   example pairs are inherently garbled and the relation is unanswerable
   as a link type. The scope vocabulary is fixed Wikidata infrastructure
   (like the ConstraintKind QIDs), so this rule is not configurable.
   Properties without a scope constraint are retained: absent evidence is
   not treated as misuse. A declared constraint with no P5314 placements
   at all is malformed and excluded: the editor asserted a scope
   restriction, and no reading of an empty placement set includes "as
   main value".

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
from typing import cast

from pydantic import BaseModel, Field, JsonValue
from pydantic_extra_types.language_code import LanguageAlpha2

from atlas_tools.wikidata.config import ExtractionConfig
from atlas_tools.wikidata.model import (
    SCOPE_AS_MAIN_VALUE,
    ConstraintKind,
    Constraints,
    EntityId,
    Pid,
    PropertyRecord,
    Qid,
    entity_number,
)

WBGETENTITIES_BATCH_SIZE = 50

_QUALIFIER_CLASS = "P2308"
_QUALIFIER_PROPERTY = "P2306"
_QUALIFIER_SCOPE = "P5314"


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

    id: EntityId
    datatype: str = ""
    labels: dict[str, TermValue] = Field(default_factory=dict)
    descriptions: dict[str, TermValue] = Field(default_factory=dict)
    aliases: dict[str, list[TermValue]] = Field(default_factory=dict)
    claims: dict[str, list[Statement]] = Field(default_factory=dict)


class WbGetEntitiesResponse(BaseModel):
    entities: dict[str, EntityDocument] = Field(default_factory=dict)


def _snak_entity_id(snak: Snak) -> EntityId | None:
    if snak.snaktype != "value" or snak.datavalue is None:
        return None

    value = snak.datavalue.value
    return cast("EntityId", value.id) if isinstance(value, EntityIdValue) else None


def _statement_entity_ids[T: EntityId = EntityId](
    claims: Mapping[str, Sequence[Statement]], claim_property: str
) -> tuple[T, ...]:
    ids: list[T] = []

    for statement in claims.get(claim_property, ()):
        entity_id = _snak_entity_id(statement.mainsnak)
        if entity_id is not None and entity_id not in ids:
            ids.append(cast("T", entity_id))

    return tuple(ids)


def _qualifier_entity_ids(statement: Statement, qualifier: str) -> tuple[str, ...]:
    ids: list[str] = []
    for snak in statement.qualifiers.get(qualifier, ()):
        entity_id = _snak_entity_id(snak)
        if entity_id is not None and entity_id not in ids:
            ids.append(entity_id)
    return tuple(ids)


def _qualifier_qids(statement: Statement, qualifier: str) -> tuple[Qid, ...]:
    """Item-valued qualifier snaks (P2308 classes, P5314 scopes), branded at parse."""
    return tuple(Qid(entity_id) for entity_id in _qualifier_entity_ids(statement, qualifier))


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
    scopes: list[Qid] | None = None
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
                _extend_unique(self.subject_types, _qualifier_qids(statement, _QUALIFIER_CLASS))
            case ConstraintKind.VALUE_TYPE:
                _extend_unique(self.value_types, _qualifier_qids(statement, _QUALIFIER_CLASS))
            case ConstraintKind.INVERSE:
                pids = _qualifier_entity_ids(statement, _QUALIFIER_PROPERTY)
                if pids and self.inverse_pid is None:
                    self.inverse_pid = Pid(pids[0])
            case ConstraintKind.PROPERTY_SCOPE:
                self._apply_scope(statement)

    def _apply_scope(self, statement: Statement) -> None:
        # A declared scope constraint distinguishes [] from None even when
        # it carries no P5314 placements (malformed; see module docstring).
        if self.scopes is None:
            self.scopes = []
        _extend_unique(self.scopes, _qualifier_qids(statement, _QUALIFIER_SCOPE))

    def build(self) -> Constraints:
        return Constraints(
            symmetric=self.symmetric,
            transitive=self.transitive,
            single_value=self.single_value,
            distinct_values=self.distinct_values,
            subject_types=tuple(self.subject_types),
            value_types=tuple(self.value_types),
            inverse_pid=self.inverse_pid,
            scopes=None if self.scopes is None else tuple(self.scopes),
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
    direct_ancestor_statements = cast(
        "tuple[Pid, ...]", _statement_entity_ids(document.claims, "P1647")
    )
    p1696_statements = cast("tuple[Pid, ...]", _statement_entity_ids(document.claims, "P1696"))
    direct_ancestors = tuple(sorted(direct_ancestor_statements))
    p1696 = tuple(sorted(p1696_statements))
    inverse_pid = p1696_statements[0] if p1696_statements else constraints.inverse_pid

    return PropertyRecord(
        pid=Pid(document.id),
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
        direct_ancestors=direct_ancestors,
        ancestors=direct_ancestor_statements,
        p1696_inverse_pids=p1696,
        inverse_pid=inverse_pid,
        constraints=constraints,
    )


def exclusion_reason(record: PropertyRecord, extraction: ExtractionConfig) -> str | None:
    """Return the first matching exclusion rule, or None when the property is retained.

    The rules and their order are documented in the module docstring.
    """
    if record.datatype != "wikibase-item":
        return f"datatype:{record.datatype}"
    p31 = set(record.p31)
    if p31 & set(extraction.maintenance_classes):
        return "maintenance"
    if p31 & set(extraction.deprecated_classes):
        return "deprecated"
    scopes = record.constraints.scopes
    if scopes is not None and SCOPE_AS_MAIN_VALUE not in scopes:
        return "qualifier-scoped"
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
