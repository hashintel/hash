"""Shared data model for the property-mining pipeline.

:class:`PropertyRecord` doubles as the records.jsonl row schema: its
JSON-mode dump (canonical key order via ``canonical_json_bytes``) is
itself the on-disk line format, so field names here are a stable file
contract.
"""

import re
from enum import StrEnum
from typing import Annotated, Literal, NewType

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic_extra_types.language_code import LanguageAlpha2

# Which SPARQL endpoint an example set was mined from. None on a record
# means the whole ladder failed (a recorded skip).
type ExampleSource = Literal["wdqs", "qlever"]

Pid = NewType("Pid", str)
"""A Wikidata property id ("P361")."""

Qid = NewType("Qid", str)
"""A Wikidata item id ("Q486972"): P31 classes, constraint classes,
taxonomy nodes, example subjects and objects."""

type EntityId = Pid | Qid
"""Either id kind, for the maps and batches that genuinely mix them
(entity-label lookups, wbgetentities batching)."""

type PidField = Annotated[Pid, StringConstraints(pattern=r"^P\d+$")]
"""A ``Pid`` model field that additionally validates the id shape.
Only for fields where emptiness is impossible."""

type QidField = Annotated[Qid, StringConstraints(pattern=r"^Q\d+$")]
"""A ``Qid`` model field that additionally validates the id shape.
Only for fields where emptiness is impossible."""


class ConstraintKind(StrEnum):
    """P2302 constraint types this tool parses (the closed parse scope).

    Any other constraint-type QID is ignored and recorded in
    ``Constraints.ignored_types``.
    """

    SYMMETRIC = "Q21510862"
    TRANSITIVE = "Q18647515"
    SINGLE_VALUE = "Q19474404"
    DISTINCT_VALUES = "Q21502410"
    SUBJECT_TYPE = "Q21503250"
    VALUE_TYPE = "Q21510865"
    INVERSE = "Q21510855"


class Constraints(BaseModel):
    """Parsed subset of P2302 property constraints.

    The authoritative parse-scope documentation lives in ``properties.py``.
    """

    symmetric: bool = False
    transitive: bool = False
    single_value: bool = False
    distinct_values: bool = False
    subject_types: tuple[QidField, ...] = ()
    value_types: tuple[QidField, ...] = ()
    inverse_pid: Pid | None = None
    ignored_types: tuple[str, ...] = ()

    model_config = ConfigDict(frozen=True)


class Example(BaseModel):
    """One subject/object pair shown on a card.

    QIDs and the stratum are record metadata: card text renders labels
    only (identifier-free), with the stratum resolved to its label. A
    ``None`` stratum means the example was selected without stratification
    (property without subject-type constraints, no taxonomy, or the
    all-strata-empty fallback; see ``examples.py``).
    """

    subject_qid: str = ""  # "" only for records predating query v4
    object_qid: str = ""
    subject_label: str
    object_label: str
    subject_type: str  # QID, or "" when the subject has no P31
    stratum: QidField | None = None  # subject-type constraint class

    model_config = ConfigDict(frozen=True)


class EntityLabel(BaseModel):
    """Primary-language label + description of a referenced entity."""

    label: str = ""
    description: str = ""

    model_config = ConfigDict(frozen=True)


class PropertyRecord(BaseModel):
    """One mined property; the records.jsonl v1 row (see module docstring).

    Mutable: extraction fills usage/examples/retrieval fields in stages.
    """

    pid: PidField
    datatype: str
    labels: dict[LanguageAlpha2, str] = Field(default_factory=dict)
    descriptions: dict[LanguageAlpha2, str] = Field(default_factory=dict)
    aliases: dict[LanguageAlpha2, list[str]] = Field(default_factory=dict)
    p31: tuple[Qid, ...] = ()
    ancestors: tuple[Pid, ...] = ()  # P1647 subproperty-of targets
    inverse_pid: Pid | None = None  # P1696, else the inverse constraint
    constraints: Constraints = Field(default_factory=Constraints)
    # Not a true usage count: sourced from ``wikibase:statements``, which
    # counts statements on the property's own page (P6 -> 34), not how
    # often the property is used in claims. Kept as a weak prominence
    # signal for diagnostics; never used for sampling and never emitted in
    # card text.
    usage_count: int | None = None
    examples: list[Example] = Field(default_factory=list)
    example_source: ExampleSource | None = None  # None = ladder skipped
    example_skipped: bool = False
    retrieved_at: str | None = None


_QID_SHAPE = re.compile(r"^Q\d+$")


def is_qid(entity_id: str) -> bool:
    """Whether the id has item shape ("Q42"), as opposed to P/L pages.

    The predicate behind the item-namespace guards: the example query
    excludes non-item subjects, the example parser re-filters, and the
    card adapter skips examples whose recorded endpoints are not items.
    """
    return _QID_SHAPE.fullmatch(entity_id) is not None


def entity_number(entity_id: str) -> int:
    """Numeric part of a PID/QID, for deterministic numeric ordering."""
    return int(entity_id[1:])
