"""Base classes for all graph types created by `.create_model()`.

These classes are primarily used as markers
"""

from abc import ABC
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema

from . import EntityTypeReference


class OntologyTypeInfo(BaseModel):
    """Information about a type."""

    model_config = ConfigDict(populate_by_name=True)

    identifier: str = Field(..., alias="$id")
    schema_url: str = Field(..., alias="$schema")
    title: str
    description: str | None = None
    kind: str


class OntologyType(BaseModel, ABC):
    """Base class for all graph ontology types."""

    info: ClassVar[OntologyTypeInfo]

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        schema: CoreSchema,
        handler: GetJsonSchemaHandler,
    ) -> JsonSchemaValue:
        """Update the schema with additional type information."""
        json_schema = handler(schema)
        json_schema.update(cls.info.model_dump(by_alias=True))
        return json_schema


class EntityTypeInfo(OntologyTypeInfo):
    """Information about an entity type."""

    all_of: list[EntityTypeReference] | None = Field(..., alias="allOf")


class EntityType(OntologyType, ABC):
    """Base class for all entity types."""

    info: ClassVar[EntityTypeInfo]


class PropertyType(OntologyType, ABC):
    """Base class for all property types."""


class DataType(OntologyType, ABC):
    """Base class for all data types."""
