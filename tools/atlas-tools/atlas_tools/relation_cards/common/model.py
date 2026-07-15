"""Identifier-free input models for the canonical relation-card renderer."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, NonNegativeInt, model_validator
from pydantic_extra_types.language_code import LanguageAlpha2

type RelationDirection = Literal["symmetric", "source -> target"]


class FrozenModel(BaseModel):
    """Reject coercion, mutation, unknown fields, and invalid defaults."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class PhraseInput(FrozenModel):
    """A transferable label and optional description, with no source ID."""

    label: str
    description: str | None = None


class EndpointTypeConstraint(FrozenModel):
    """One source type's allowed target types and per-source cardinality."""

    source_type: PhraseInput
    target_types: tuple[PhraseInput, ...] = ()
    minimum_targets: NonNegativeInt | None = None
    maximum_targets: NonNegativeInt | None = None

    @model_validator(mode="after")
    def check_cardinality(self) -> Self:
        if (
            self.minimum_targets is not None
            and self.maximum_targets is not None
            and self.minimum_targets > self.maximum_targets
        ):
            raise ValueError("minimum_targets must not exceed maximum_targets")
        return self


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
    endpoint_constraints: tuple[EndpointTypeConstraint, ...] = ()
    source_types: tuple[PhraseInput, ...] = ()
    target_types: tuple[PhraseInput, ...] = ()
    constraints: RelationConstraints
    examples: tuple[RelationExample, ...] = ()
    slug: str | None = None
