from abc import ABC
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field


class OntologyTypeSchema(BaseModel, ABC):
    """Common base class for all ontology types."""

    identifier: str = Field(..., alias="$id")
    title: str
    description: str | None = None
    kind: Literal["dataType", "propertyType", "entityType"]
    schema_url: str = Field(..., alias="$schema")


T = TypeVar("T", bound=BaseModel)


class OneOf(BaseModel, Generic[T]):
    one_of: list[T] = Field(..., alias="oneOf")


class Array(BaseModel, Generic[T]):
    ty: Literal["array"] = Field(..., alias="type")
    items: T
    min_items: int | None = Field(default=None, alias="minItems")
    max_items: int | None = Field(default=None, alias="maxItems")


class Object(BaseModel, Generic[T]):
    ty: Literal["object"] = Field(..., alias="type")
    properties: dict[str, T]
    required: list[str] | None = None
