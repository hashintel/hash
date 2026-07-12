"""Identifier-free input models for the canonical relation-card renderer."""

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic_extra_types.language_code import LanguageAlpha2

type RelationDirection = Literal["symmetric", "source -> target"]


class FrozenModel(BaseModel):
    """Closed, immutable base for canonical renderer inputs."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class PhraseInput(FrozenModel):
    """A transferable label and optional description, with no source ID."""

    label: str
    description: str | None = None


class RelationConstraints(FrozenModel):
    """The shared constraint vocabulary.

    ``None`` means the datasource does not record that fact. This is distinct
    from ``False``: cards must report the ontology as-is instead of turning
    missing metadata into a negative assertion.
    """

    symmetric: bool | None = None
    transitive: bool | None = None
    single_value: bool | None = None
    distinct_values: bool | None = None
    direction: RelationDirection


class RelationExample(FrozenModel):
    """One identifier-free example pair and its optional source-type stratum."""

    subject_label: str
    object_label: str
    stratum_label: str | None = None


class RelationCardInput(FrozenModel):
    """Canonical semantic input accepted from any ontology adapter."""

    language: LanguageAlpha2
    title: str
    description: str | None = None
    aliases: tuple[str, ...] = ()
    inverse: PhraseInput | None = None
    ancestors: tuple[PhraseInput, ...] = ()
    source_types: tuple[PhraseInput, ...] = ()
    target_types: tuple[PhraseInput, ...] = ()
    constraints: RelationConstraints
    examples: tuple[RelationExample, ...] = ()
    slug: str | None = None
