"""A property type schema as defined by the Block Protocol."""

from pydantic import BaseModel, Field, RootModel

from ._schema import Array, Object, OneOf, OntologyTypeSchema
from .data_type import DataTypeReference

__all__ = ["PropertyTypeSchema"]


class PropertyTypeReference(BaseModel):
    ref: str = Field(..., alias="$ref")


class PropertyValue(RootModel):
    root: DataTypeReference | Object[
        PropertyTypeReference | Array[PropertyTypeReference]
    ] | Array[OneOf["PropertyValue"]]


class PropertyTypeSchema(OntologyTypeSchema, OneOf[PropertyValue]):
    """A property type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/property-type
    """
