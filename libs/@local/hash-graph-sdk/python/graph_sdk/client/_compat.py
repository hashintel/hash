from typing import TypeVar

from graph_client.models import (
    Schema,
    Schema4,
    Schema5,
    Schema6,
    SchemaModel,
    SchemaModel1,
)
from graph_types import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)
U = TypeVar("U", bound=BaseModel)


def recast(type_: type[T], value: U) -> T:
    return type_.model_validate(value.model_dump(by_alias=True))


def convert_data_type_to_schema(schema: DataTypeSchema) -> Schema:
    return Schema.model_validate(schema.model_dump(by_alias=True))


def convert_data_type_to_schema4(schema: DataTypeSchema) -> Schema4:
    return Schema4.model_validate(schema.model_dump(by_alias=True))


def convert_property_type_to_schema_model1(schema: PropertyTypeSchema) -> SchemaModel1:
    return SchemaModel1.model_validate(schema.model_dump(by_alias=True))


def convert_property_type_to_schema6(schema: PropertyTypeSchema) -> Schema6:
    return Schema6.model_validate(schema.model_dump(by_alias=True))


def convert_entity_type_to_schema_model(schema: EntityTypeSchema) -> SchemaModel:
    return SchemaModel.model_validate(schema.model_dump(by_alias=True))


def convert_entity_type_to_schema5(schema: EntityTypeSchema) -> Schema5:
    return Schema5.model_validate(schema.model_dump(by_alias=True))
