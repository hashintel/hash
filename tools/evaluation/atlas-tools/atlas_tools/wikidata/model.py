"""Shared data model for the W2a property pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Constraints:
    """Parsed subset of P2302 property constraints (see properties.py for
    the authoritative parse-scope documentation)."""

    symmetric: bool = False
    transitive: bool = False
    single_value: bool = False
    distinct_values: bool = False
    subject_types: tuple[str, ...] = ()
    value_types: tuple[str, ...] = ()
    inverse_pid: str | None = None
    ignored_types: tuple[str, ...] = ()


@dataclass(frozen=True)
class Example:
    subject_label: str
    object_label: str
    subject_type: str  # QID, or "" when the subject has no P31


@dataclass
class PropertyRecord:
    pid: str
    datatype: str
    labels: dict[str, str] = field(default_factory=dict)
    descriptions: dict[str, str] = field(default_factory=dict)
    aliases: dict[str, list[str]] = field(default_factory=dict)
    p31: tuple[str, ...] = ()
    ancestors: tuple[str, ...] = ()  # P1647 subproperty-of targets
    inverse_pid: str | None = None  # P1696, else the inverse constraint
    constraints: Constraints = field(default_factory=Constraints)
    # Usage count is for sampling ONLY; it is never emitted as a semantic
    # field (it does not appear in card text).
    usage_count: int | None = None
    examples: list[Example] = field(default_factory=list)
    example_source: str | None = None  # "wdqs" | "qlever" | None (skipped)
    example_skipped: bool = False
    retrieved_at: str | None = None


def pid_number(entity_id: str) -> int:
    """Numeric part of a PID/QID, for deterministic numeric ordering."""
    return int(entity_id[1:])
