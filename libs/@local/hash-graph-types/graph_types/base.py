from abc import ABC

from pydantic import BaseModel, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema


class Type(ABC, BaseModel):
    """Base class for all graph types."""


class EntityType(ABC, Type):
    """Base class for all entity types."""

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        schema: CoreSchema,
        handler: GetJsonSchemaHandler,
    ) -> JsonSchemaValue:
        json_schema = handler(schema)
        json_schema.update(
            **{
                "$id": cls.identifier,
                "$schema": cls.schema_url,
                "title": cls.title,
                "description": cls.description,
                "kind": cls.kind,
            },
        )

        return json_schema


class PropertyType(ABC, Type):
    """Base class for all property types."""


class DataType(ABC, Type):
    """Base class for all data types."""
