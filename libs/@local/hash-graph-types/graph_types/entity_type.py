"""An entity type schema as defined by the Block Protocol."""

from typing import (
    TYPE_CHECKING,
    Any,
    ClassVar,
    Literal,
    Never,
)
from uuid import UUID

from pydantic import (
    ConfigDict,
    Field,
    RootModel,
    create_model,
)
from slugify import slugify

from ._schema import Array, Object, OneOf, OntologyTypeSchema, Schema
from .base import EntityType, TypeInfo
from .property_type import PropertyTypeReference

if TYPE_CHECKING:
    from . import GraphAPIProtocol

__all__ = ["EntityTypeSchema", "EntityTypeReference"]


class EntityTypeReference(Schema):
    """A reference to an entity type schema."""

    ref: str = Field(..., alias="$ref")
    cache: ClassVar[dict[str, type[RootModel]]] = {}

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[RootModel]:
        """Creates a model from the referenced entity type schema."""
        if cached := self.cache.get(self.ref):
            return cached

        schema = await graph.get_entity_type(self.ref, actor_id=actor_id)

        model = create_model(
            slugify(self.ref, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=RootModel,
            root=(await schema.create_entity_type(actor_id=actor_id, graph=graph), ...),
        )
        self.cache[self.ref] = model
        return model


class EmptyDict(Schema):
    model_config = ConfigDict(title=None, extra="forbid")

    async def create_model(self, *, actor_id: UUID, graph: "GraphAPIProtocol") -> Never:
        raise NotImplementedError


class EntityTypeSchema(
    OntologyTypeSchema,
    Object[PropertyTypeReference | Array[PropertyTypeReference]],
):
    """An entity type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type
    """

    kind: Literal["entityType"]
    examples: list[dict[str, Any]] | None = None
    links: dict[str, Array[OneOf[EntityTypeReference] | EmptyDict]] | None = None
    all_of: list[EntityTypeReference] | None = Field(None, alias="allOf")

    async def create_entity_type(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[EntityType]:
        """Create an annotated type from this schema."""
        # Take the fields from Object and create a new model, with a new baseclass.
        proxy = await Object.create_model(self, actor_id=actor_id, graph=graph)

        return create_model(
            slugify(self.identifier, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=EntityType,
            __cls_kwargs__={
                "info": TypeInfo(
                    identifier=self.identifier,
                    schema_url=self.schema_url,
                    title=self.title,
                    description=self.description,
                    kind=self.kind,
                )
            },
            **proxy.model_fields,
        )
