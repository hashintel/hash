"""Replicates the Block Protocol type system to be used in Python."""

from typing import (
    Any,
    Generic,
    TypeVar,
)

from pydantic import (
    BaseModel,
    Extra,
    Field,
)
from pydantic.generics import GenericModel

__all__ = [
    "DataTypeSchema",
    "PropertyTypeSchema",
    "EntityTypeSchema",
]


T = TypeVar("T")


class OneOf(GenericModel, Generic[T]):
    one_of: list[T] = Field(..., alias="oneOf")


class AllOf(GenericModel, Generic[T]):
    all_of: list[T] = Field(..., alias="allOf")


class Array(GenericModel, Generic[T]):
    ty: str = Field(default="array", const=True, alias="type")
    items: T
    min_items: int | None = Field(default=None, alias="minItems")
    max_items: int | None = Field(default=None, alias="maxItems")


class Object(GenericModel, Generic[T]):
    ty: str = Field(default="object", const=True, alias="type")
    properties: dict[str, T]
    required: list[str] | None


class EmptyDict(BaseModel):
    class Config:
        title: str | None = None
        extra = "forbid"


class DataTypeReference(BaseModel):
    ref: str = Field(..., alias="$ref")


class PropertyTypeReference(BaseModel):
    ref: str = Field(..., alias="$ref")


class EntityTypeReference(BaseModel):
    ref: str = Field(..., alias="$ref")


class OntologyTypeSchema(BaseModel):
    """Common base class for all ontology types."""

    identifier: str = Field(..., alias="$id")
    title: str
    description: str | None
    kind: str
    schema_url: str = Field(..., alias="$schema")


class DataTypeSchema(OntologyTypeSchema, extra=Extra.allow):
    """A data type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/data-type
    """

    ty: str = Field(..., alias="type")

    def _type(self) -> type:
        match self.ty:
            case "string":
                return str
            case "number":
                return float
            case "boolean":
                return bool
            case "null":
                return type(None)
            case "array":
                return list[Any]
            case "object":
                return dict[str, Any]
            case _:
                # TODO: activities should never raise an exception, but instead return
                #  an error value that the workflow can handle.
                #  https://app.asana.com/0/0/1204934059777411/f
                msg = f"Unknown type: {self.ty}"
                raise ValueError(msg)


class PropertyValueOneOf(BaseModel):
    one_of: list["PropertyValue"] = Field(..., alias="oneOf")


PropertyValue = (
    DataTypeReference
    | Object[PropertyTypeReference | Array[PropertyTypeReference]]
    | Array[PropertyValueOneOf]
)

PropertyValueOneOf.update_forward_refs()


class PropertyTypeSchema(OntologyTypeSchema, PropertyValueOneOf):
    """A property type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/property-type
    """


class EntityTypeSchema(OntologyTypeSchema):
    """An entity type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type
    """

    all_of: list[EntityTypeReference] | None = Field(default=None, alias="allOf")
    ty: str = Field(default="object", const=True, alias="type")
    properties: dict[str, PropertyTypeReference | Array[PropertyTypeReference]]
    required: list[str] | None
    examples: list[dict[str, Any]] | None
    links: dict[str, Array[OneOf[EntityTypeReference] | EmptyDict]] | None
