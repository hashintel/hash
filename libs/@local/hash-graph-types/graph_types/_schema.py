import asyncio
from abc import ABC, abstractmethod
from collections.abc import Awaitable
from typing import TYPE_CHECKING, Annotated, Any, Generic, Literal, TypeVar, cast
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    GetJsonSchemaHandler,
    conlist,
    create_model,
)
from pydantic.fields import FieldInfo
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema

from ._annotations import not_required
from .base import OntologyTypeInfo

if TYPE_CHECKING:
    from . import GraphAPIProtocol


class Schema(BaseModel, ABC):
    @abstractmethod
    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[BaseModel] | Annotated[Any, ...]:
        ...


class OntologyTypeSchema(BaseModel, ABC):
    """Common base class for all ontology types."""

    identifier: str = Field(..., alias="$id")
    title: str
    description: str | None = None
    kind: Literal["dataType", "propertyType", "entityType"]
    schema_url: str = Field(..., alias="$schema")

    def type_info(self) -> OntologyTypeInfo:
        return OntologyTypeInfo(
            identifier=self.identifier,
            title=self.title,
            description=self.description,
            kind=self.kind,
            schema_url=self.schema_url,
        )


T = TypeVar("T", bound=Schema)


class OneOf(Schema, Generic[T]):
    one_of: list[T] = Field(..., alias="oneOf")

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> object:
        types = await asyncio.gather(
            *[
                value.create_model(actor_id=actor_id, graph=graph)
                for value in self.one_of
            ],
        )

        union = None
        for type_ in types:
            union = type_ if union is None else union | type_

        if union is None:
            msg = "No types provided"
            raise ValueError(msg)

        class OneOfSchema:
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

        return Annotated[union, OneOfSchema]


class Array(Schema, Generic[T]):
    ty: Literal["array"] = Field(..., alias="type")
    items: T
    min_items: int | None = Field(default=None, alias="minItems")
    max_items: int | None = Field(default=None, alias="maxItems")

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[list[BaseModel]]:
        type_items = await self.items.create_model(actor_id=actor_id, graph=graph)

        type_ = conlist(
            type_items,
            min_length=self.min_items,
            max_length=self.max_items,
        )

        return cast(type[list[BaseModel]], type_)


U = TypeVar("U")


class Object(Schema, Generic[T]):
    ty: Literal["object"] = Field(..., alias="type")
    properties: dict[str, T]
    required: list[str] | None = None

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[BaseModel]:
        async def async_value(
            key: str,
            value: Awaitable[type[BaseModel] | Any],
        ) -> tuple[str, type[BaseModel] | Any]:
            return key, await value

        def field_type(key: str, type_: type[U]) -> type[U]:
            if self.required is None or key not in self.required:
                return not_required(type_)

            return type_

        def field_extra(extra: dict[str, Any]) -> None:
            any_of = extra.pop("anyOf", None)

            extra.clear()
            extra.update(any_of[0])

        def field_info(key: str) -> FieldInfo:
            # cast is necessary here because `Field`
            # return `FieldInfo`, even though it doesn't.
            if self.required is None or key not in self.required:
                return cast(FieldInfo, Field(None, json_schema_extra=field_extra))

            return cast(FieldInfo, Field(...))

        types = dict(
            await asyncio.gather(
                *(
                    async_value(key, value.create_model(actor_id=actor_id, graph=graph))
                    for key, value in self.properties.items()
                ),
            ),
        )

        types = {
            key: (field_type(key, value), field_info(key))
            for key, value in types.items()
        }

        return create_model(
            "DictSchema",
            __config__=ConfigDict(extra="forbid"),
            **types,
        )
