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
    BaseModel,
    Field,
    RootModel,
    create_model,
)
from slugify import slugify

from ._cache import Cache
from ._schema import Array, Object, OneOf, OntologyTypeSchema, Schema
from .base import PropertyType
from .data_type import DataTypeReference

if TYPE_CHECKING:
    from . import GraphAPIProtocol

__all__ = ["PropertyTypeSchema", "PropertyTypeReference"]


async def fetch_model(
    ref: str,
    *,
    actor_id: UUID,
    graph: "GraphAPIProtocol",
) -> type[PropertyType]:
    schema = await graph.get_property_type(ref, actor_id=actor_id)
    return await schema.create_model(actor_id=actor_id, graph=graph)


class PropertyTypeReference(Schema):
    """A reference to a property type schema."""

    ref: str = Field(..., alias="$ref")
    _cache: ClassVar[Cache[type[PropertyType]]] = Cache()

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[PropertyType]:
        """Creates a model from the referenced property type schema."""
        return await self._cache.get(
            self.ref,
            on_miss=lambda: fetch_model(self.ref, actor_id=actor_id, graph=graph),
        )


class PropertyValue(RootModel, Schema):
    root: DataTypeReference | Object[
        PropertyTypeReference | Array[PropertyTypeReference]
    ] | Array[OneOf["PropertyValue"]]

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[RootModel] | Annotated[Any, ...]:  # noqa: ANN401
        return await self.root.create_model(actor_id=actor_id, graph=graph)


class PropertyTypeSchema(OntologyTypeSchema, OneOf[PropertyValue]):
    """A property type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/property-type
    """

    kind: Literal["propertyType"]

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[PropertyType]:
        """Create an annotated type from this schema."""
        inner = await OneOf.create_model(self, actor_id=actor_id, graph=graph)

        class_name = slugify(
            self.identifier,
            regex_pattern=r"[^a-z0-9_]+",
            separator="_",
        )

        base: type[BaseModel] = type(
            f"{class_name}Base",
            (PropertyType,),
            {"info": self.type_info()},
        )

        model = create_model(
            class_name,
            __base__=(base, RootModel),
            root=(inner, Field(...)),
        )

        return cast(type[PropertyType], model)
