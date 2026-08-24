"""Shared relation-card row and source-qualified identity types."""

from typing import Self

from pydantic import BaseModel, ConfigDict, NonNegativeInt, model_validator

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.domain.api import (
    RelationId,
    RelationNamespace,
    RelationSourceSpec,
    Sha256Hex,
    qualify_relation_id,
    split_relation_id,
)

__all__ = [
    "CardRow",
    "RelationId",
    "RelationNamespace",
    "RelationSourceSpec",
    "qualify_relation_id",
    "split_relation_id",
]


class CardRow(BaseModel):
    card_text: str
    card_hash: Sha256Hex

    token_count: NonNegativeInt
    truncations: list[str]

    severely_truncated: bool

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="after")
    def check_card_hash(self) -> Self:
        expected = sha256_bytes(self.card_text.encode("utf-8"))
        if self.card_hash != expected:
            raise ValueError("card_hash must be the sha256 of the UTF-8 bytes of card_text")

        return self
