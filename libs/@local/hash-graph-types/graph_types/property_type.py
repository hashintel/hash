"""A property type schema as defined by the Block Protocol."""
from typing import (
    Annotated,
    Any,
    ClassVar,
    Literal,
)
from uuid import UUID

from pydantic import (
    Field,
    GetJsonSchemaHandler,
    RootModel,
    create_model,
)
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema
from slugify import slugify

from ._schema import Array, G, Object, OneOf, OntologyTypeSchema, Schema
from .data_type import DataTypeReference

__all__ = ["PropertyTypeSchema", "PropertyTypeReference"]


class PropertyTypeReference(Schema):
    """A reference to a property type schema."""

    ref: str = Field(..., alias="$ref")
    cache: ClassVar[dict[str, type[RootModel]]] = {}

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: G,
    ) -> type[RootModel]:
        """Creates a model from the referenced property type schema."""
        if cached := self.cache.get(self.ref):
            return cached

        schema = await graph.get_property_type(self.ref, actor_id=actor_id)

        model = create_model(
            slugify(self.ref, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=RootModel,
            root=(
                await schema.create_property_type(actor_id=actor_id, graph=graph),
                ...,
            ),
        )
        self.cache[self.ref] = model
        return model


class PropertyValue(RootModel, Schema):
    root: DataTypeReference | Object[
        PropertyTypeReference | Array[PropertyTypeReference]
    ] | Array[OneOf["PropertyValue"]]

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: G,
    ) -> type[RootModel] | Annotated[Any, ...]:
        return await self.root.create_model(actor_id=actor_id, graph=graph)


class PropertyTypeSchema(OntologyTypeSchema, OneOf[PropertyValue]):
    """A property type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/property-type
    """

    kind: Literal["propertyType"]

    async def create_property_type(
        self,
        *,
        actor_id: UUID,
        graph: G,
    ) -> Annotated[object, "PropertyTypeAnnotation"]:
        """Create an annotated type from this schema."""

        class PropertyTypeAnnotation:
            @classmethod
            def __get_pydantic_json_schema__(
                cls,
                schema: CoreSchema,
                handler: GetJsonSchemaHandler,
            ) -> JsonSchemaValue:
                json_schema = handler(schema)
                json_schema.update(
                    **{
                        "$id": self.identifier,
                        "$schema": self.schema_url,
                        "title": self.title,
                        "description": self.description,
                        "kind": self.kind,
                    },
                )
                return json_schema

        return Annotated[
            await self.create_model(actor_id=actor_id, graph=graph),
            PropertyTypeAnnotation,
        ]
