"""A property type schema as defined by the Block Protocol."""

from typing import (
    TYPE_CHECKING,
    Annotated,
    Any,
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

from ._schema import Array, Object, OneOf, OntologyTypeSchema, Schema
from .data_type import DataTypeReference

if TYPE_CHECKING:
    from . import GraphAPIProtocol
    from .base import PropertyType

__all__ = ["PropertyTypeSchema", "PropertyTypeReference"]


class PropertyTypeReference(Schema):
    """A reference to a property type schema."""

    ref: str = Field(..., alias="$ref")

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
        additional_properties: bool,
    ) -> type["PropertyType"]:
        """Creates a model from the referenced property type schema."""
        schema = await graph.get_property_type(self.ref, actor_id=actor_id)
        return await schema.create_model(
            actor_id=actor_id,
            graph=graph,
            additional_properties=additional_properties,
        )


class PropertyValue(RootModel, Schema):
    root: (
        DataTypeReference
        | Object[PropertyTypeReference | Array[PropertyTypeReference]]
        | Array[OneOf["PropertyValue"]]
    )

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
        additional_properties: bool,
    ) -> type[RootModel] | Annotated[Any, ...]:  # noqa: ANN401
        return await self.root.create_model(
            actor_id=actor_id,
            graph=graph,
            additional_properties=additional_properties,
        )


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
        additional_properties: bool,
    ) -> type["PropertyType"]:
        """Create an annotated type from this schema."""
        from .base import PropertyType

        inner = await OneOf.create_model(
            self,
            actor_id=actor_id,
            graph=graph,
            additional_properties=additional_properties,
        )

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
