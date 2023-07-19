"""Base classes for all graph types created by `.create_model()`.

These classes are primarily used as markers
"""
from abc import ABC
from typing import ClassVar

from pydantic import BaseModel, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema


class TypeInfo(BaseModel):
    """Information about a type."""

    identifier: str
    schema_url: str
    title: str
    description: str | None = None
    kind: str


class Type(BaseModel, ABC):
    """Base class for all graph types."""

    info: ClassVar[TypeInfo]

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        schema: CoreSchema,
        handler: GetJsonSchemaHandler,
    ) -> JsonSchemaValue:
        """Update the schema with additional type information."""
        json_schema = handler(schema)
        json_schema.update(
            **{
                "$id": cls.info.identifier,
                "$schema": cls.info.schema_url,
                "title": cls.info.title,
                "description": cls.info.description,
                "kind": cls.info.kind,
            },
        )
        return json_schema


class EntityType(Type, ABC):
    """Base class for all entity types."""


class PropertyType(Type, ABC):
    """Base class for all property types."""


class DataType(Type, ABC):
    """Base class for all data types."""
