"""A data type schema as defined by the Block Protocol."""
from typing import Literal

from pydantic import BaseModel, Extra, Field

from ._schema import OntologyTypeSchema

__all__ = ["DataTypeSchema"]


class DataTypeReference(BaseModel):
    ref: str = Field(..., alias="$ref")


class DataTypeSchema(OntologyTypeSchema, extra=Extra.allow):
    """A data type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/data-type
    """

    kind: Literal["dataType"]
    ty: str = Field(..., alias="type")
