"""Project relation-card artifacts into the immutable facts evaluation consumes.

The card producer may add fields over time, but evaluation identity depends on
only this projection. Storage validates the producer artifact first, then
constructs this strict model so planning and execution never carry mutable or
uninterpreted card dictionaries.
"""

from typing import Self

from pydantic import NonNegativeInt, model_validator

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.domain.api import (
    FrozenModel,
    NonEmptyStr,
    RelationFamilyId,
    RelationId,
    RelationNamespace,
)
from atlas_tools.relation.evaluation.domain.identity import CardHash


class EvaluationCard(FrozenModel):
    """Carry the exact card text and grouping facts used by evaluation."""

    relation_id: RelationId
    producer: RelationNamespace
    card_text: str
    card_hash: CardHash
    token_count: NonNegativeInt
    prescreen_stratum: NonEmptyStr = "unstratified"
    pilot_strata: tuple[str, ...] = ()
    family_id: RelationFamilyId | None = None

    @model_validator(mode="after")
    def check_card_hash(self) -> Self:
        expected = sha256_bytes(self.card_text.encode("utf-8"))
        if self.card_hash != expected:
            raise ValueError("card_hash must be the SHA-256 of UTF-8 card_text")

        if len(self.pilot_strata) != len(set(self.pilot_strata)):
            raise ValueError("pilot_strata must not contain duplicates")

        if tuple(sorted(self.pilot_strata)) != self.pilot_strata:
            raise ValueError("pilot_strata must use stable ascending order")

        return self
