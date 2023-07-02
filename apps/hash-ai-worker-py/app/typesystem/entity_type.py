"""An entity type schema as defined by the Block Protocol."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from ._schema import Array, Object, OneOf, OntologyTypeSchema
from .property_type import PropertyTypeReference

__all__ = ["EntityTypeSchema"]


class EntityTypeReference(BaseModel):
    ref: str = Field(..., alias="$ref")


class EmptyDict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EntityTypeSchema(
    OntologyTypeSchema,
    Object[PropertyTypeReference | Array[PropertyTypeReference]],
):
    """An entity type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type
    """

    examples: list[dict[str, Any]] | None = None
    links: dict[str, Array[OneOf[EntityTypeReference] | EmptyDict]] | None = None
    all_of: list[EntityTypeReference] | None = Field(None, alias="allOf")
