import asyncio
import typing
from abc import ABC, abstractmethod
from collections.abc import Awaitable
from typing import Annotated, Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import (
    BaseModel,
    Field,
    GetCoreSchemaHandler,
    GetJsonSchemaHandler,
)
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema, core_schema

if typing.TYPE_CHECKING:
    from . import GraphApiProtocol

G = TypeVar("G", bound="GraphApiProtocol")


class Schema(BaseModel, ABC):
    @abstractmethod
    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: G,
    ) -> type[BaseModel] | Annotated[Any, ...]:
        ...


class OntologyTypeSchema(BaseModel, ABC):
    """Common base class for all ontology types."""

    identifier: str = Field(..., alias="$id")
    title: str
    description: str | None = None
    kind: Literal["dataType", "propertyType", "entityType"]
    schema_url: str = Field(..., alias="$schema")


T = TypeVar("T", bound=Schema)


class OneOf(Schema, Generic[T]):
    one_of: list[T] = Field(..., alias="oneOf")

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: G,
    ) -> Annotated[Any, ...]:
        types = await asyncio.gather(
            *[
                value.create_model(actor_id=actor_id, graph=graph)
                for value in self.one_of
            ],
        )

        class OneOfSchema:
            @classmethod
            def __get_pydantic_core_schema__(
                cls,
                _source_type: Any,  # noqa: ANN401
                handler: GetCoreSchemaHandler,
            ) -> CoreSchema:
                return core_schema.union_schema([handler(t) for t in types])

            @classmethod
            def __get_pydantic_json_schema__(
                cls,
                schema: CoreSchema,
                handler: GetJsonSchemaHandler,
            ) -> JsonSchemaValue:
                json_schema = handler(schema)
                if any_of := json_schema.pop("anyOf", None):
                    json_schema["oneOf"] = any_of
                return json_schema

        return Annotated[OneOf[T], OneOfSchema]


class Array(Schema, Generic[T]):
    ty: Literal["array"] = Field(..., alias="type")
    items: T
    min_items: int | None = Field(default=None, alias="minItems")
    max_items: int | None = Field(default=None, alias="maxItems")

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: G,
    ) -> Annotated[Any, ...]:
        ty = await self.items.create_model(actor_id=actor_id, graph=graph)

        class ListSchema:
            @classmethod
            def __get_pydantic_core_schema__(
                cls,
                _source_type: Any,  # noqa: ANN401
                handler: GetCoreSchemaHandler,
            ) -> CoreSchema:
                return core_schema.list_schema(
                    handler.generate_schema(ty),
                    min_length=self.min_items,
                    max_length=self.max_items,
                )

        return Annotated[list[T], ListSchema]


class Object(Schema, Generic[T]):
    ty: Literal["object"] = Field(..., alias="type")
    properties: dict[str, T]
    required: list[str] | None = None

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: G,
    ) -> Annotated[Any, ...]:
        async def async_value(
            key: str,
            value: Awaitable[type[BaseModel] | Any],
        ) -> tuple[str, type[BaseModel] | Any]:
            return key, await value

        types = dict(
            await asyncio.gather(
                *(
                    async_value(key, value.create_model(actor_id=actor_id, graph=graph))
                    for key, value in self.properties.items()
                ),
            ),
        )

        class DictSchema:
            @classmethod
            def __get_pydantic_core_schema__(
                cls,
                _source_type: Any,  # noqa: ANN401
                handler: GetCoreSchemaHandler,
            ) -> CoreSchema:
                return core_schema.typed_dict_schema(
                    {
                        property_type_id: core_schema.typed_dict_field(
                            handler.generate_schema(property_type),
                            required=(
                                property_type_id in self.required
                                if self.required
                                else None
                            ),
                        )
                        for property_type_id, property_type in types.items()
                    },
                    extra_behavior="forbid",
                )

            @classmethod
            def __get_pydantic_json_schema__(
                cls,
                schema: CoreSchema,
                handler: GetJsonSchemaHandler,
            ) -> JsonSchemaValue:
                json_schema = handler(schema)
                json_schema.update(additionalProperties=False)
                return json_schema

        return Annotated[dict[str, Any], DictSchema]
