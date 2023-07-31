"""An entity type schema as defined by the Block Protocol."""

from typing import (
    TYPE_CHECKING,
    Any,
    ClassVar,
    Literal,
    Never,
    cast,
)
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    create_model,
)
from slugify import slugify

from ._cache import Cache
from ._schema import Array, Object, OneOf, OntologyTypeSchema, Schema
from .base import EntityType, EntityTypeInfo
from .property_type import PropertyTypeReference

if TYPE_CHECKING:
    from . import GraphAPIProtocol

__all__ = ["EntityTypeSchema", "EntityTypeReference"]


async def fetch_model(
    ref: str,
    *,
    actor_id: UUID,
    graph: "GraphAPIProtocol",
) -> type[EntityType]:
    schema = await graph.get_entity_type(ref, actor_id=actor_id)
    return await schema.create_entity_type(actor_id=actor_id, graph=graph)


class EntityTypeReference(Schema):
    """A reference to an entity type schema."""

    ref: str = Field(..., alias="$ref")
    cache: ClassVar[Cache[type[EntityType]]] = Cache()

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[EntityType]:
        """Creates a model from the referenced entity type schema."""
        return await self.cache.get(
            self.ref,
            on_miss=lambda: fetch_model(self.ref, actor_id=actor_id, graph=graph),
        )


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

    def type_info(self) -> EntityTypeInfo:
        """Return the type information for this schema."""
        original = super().type_info()

        return EntityTypeInfo.model_validate(
            (original.model_dump() | {"all_of": self.all_of or []}),
        )

    async def create_entity_type(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[EntityType]:
        """Create an annotated type from this schema."""
        # Take the fields from Object and create a new model, with a new baseclass.
        proxy = await Object.create_model(self, actor_id=actor_id, graph=graph)

        class_name = slugify(
            self.identifier,
            regex_pattern=r"[^a-z0-9_]+",
            separator="_",
        )

        base: type[BaseModel] = type(
            f"{class_name}Base",
            (EntityType,),
            {"info": self.type_info()},
        )

        model = create_model(
            class_name,
            __base__=(base, proxy),
        )

        return cast(type[EntityType], model)
