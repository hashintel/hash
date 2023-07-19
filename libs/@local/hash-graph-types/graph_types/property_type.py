"""A property type schema as defined by the Block Protocol."""
from typing import (
    TYPE_CHECKING,
    Annotated,
    Any,
    ClassVar,
    Literal,
    cast,
)
from uuid import UUID

from pydantic import (
    Field,
    RootModel,
    create_model,
    BaseModel,
)
from slugify import slugify

from ._schema import Array, Object, OneOf, OntologyTypeSchema, Schema
from .base import PropertyType
from .data_type import DataTypeReference

if TYPE_CHECKING:
    from . import GraphAPIProtocol

__all__ = ["PropertyTypeSchema", "PropertyTypeReference"]


class PropertyTypeReference(Schema):
    """A reference to a property type schema."""

    ref: str = Field(..., alias="$ref")
    cache: ClassVar[dict[str, type[RootModel]]] = {}

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
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
        graph: "GraphAPIProtocol",
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
        graph: "GraphAPIProtocol",
    ) -> type[PropertyType]:
        """Create an annotated type from this schema."""
        inner = await self.create_model(actor_id=actor_id, graph=graph)

        base: type[BaseModel] = type(
            "Base", (PropertyType,), {"info": self.type_info()}
        )

        model = create_model(
            slugify(self.identifier, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=(base, RootModel),
            root=(inner, Field(...)),
        )

        return cast(type[PropertyType], model)
