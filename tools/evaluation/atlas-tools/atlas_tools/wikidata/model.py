"""Shared data model for the W2a property pipeline.

:class:`PropertyRecord` doubles as the records.jsonl v1 row schema: its
JSON-mode dump (canonical key order via ``canonical_json_bytes``) IS the
on-disk line format, so field names here are a stable file contract.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal, NewType

from pydantic import BaseModel, ConfigDict, Field
from pydantic_extra_types.language_code import LanguageAlpha2

# Which SPARQL endpoint an example set was mined from. None on a record
# means the whole ladder failed (a recorded skip).
type ExampleSource = Literal["wdqs", "qlever"]
Pid = NewType("Pid", str)


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
    """Parsed subset of P2302 property constraints (see properties.py for
    the authoritative parse-scope documentation)."""

    symmetric: bool = False
    transitive: bool = False
    single_value: bool = False
    distinct_values: bool = False
    subject_types: tuple[Pid, ...] = ()
    value_types: tuple[Pid, ...] = ()
    inverse_pid: str | None = None
    ignored_types: tuple[str, ...] = ()

    model_config = ConfigDict(frozen=True)


class Example(BaseModel):
    """One subject/object label pair shown on a card."""

    subject_label: str
    object_label: str
    subject_type: str  # QID, or "" when the subject has no P31

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

    pid: Pid
    datatype: str
    labels: dict[LanguageAlpha2, str] = Field(default_factory=dict)
    descriptions: dict[LanguageAlpha2, str] = Field(default_factory=dict)
    aliases: dict[LanguageAlpha2, list[str]] = Field(default_factory=dict)
    p31: tuple[str, ...] = ()
    ancestors: tuple[Pid, ...] = ()  # P1647 subproperty-of targets
    inverse_pid: Pid | None = None  # P1696, else the inverse constraint
    constraints: Constraints = Field(default_factory=Constraints)
    # NOT a usage count despite the PRD's original intent: sourced from
    # ``wikibase:statements``, which counts statements on the property's
    # own page (P6 -> 34). Kept as a weak prominence signal / diagnostic;
    # never used for sampling and never emitted in card text.
    usage_count: int | None = None
    examples: list[Example] = Field(default_factory=list)
    example_source: ExampleSource | None = None  # None = ladder skipped
    example_skipped: bool = False
    retrieved_at: str | None = None


def pid_number(entity_id: str) -> int:
    """Numeric part of a PID/QID, for deterministic numeric ordering."""
    return int(entity_id[1:])
