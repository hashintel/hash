"""An entity type schema as defined by the Block Protocol."""

from typing import (
    Annotated,
    Any,
    ClassVar,
    Literal,
)
from uuid import UUID

from pydantic import (
    ConfigDict,
    Field,
    GetJsonSchemaHandler,
    RootModel,
    create_model,
)
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema
from slugify import slugify
from temporalio import workflow

from ._schema import Array, Object, OneOf, OntologyTypeSchema, Schema
from .property_type import PropertyTypeReference

__all__ = ["EntityTypeSchema"]


class EntityTypeReference(Schema):
    ref: str = Field(..., alias="$ref")
    cache: ClassVar[dict[str, type[RootModel]]] = {}

    async def create_model(self, *, actor_id: UUID) -> type[RootModel]:
        if cached := self.cache.get(self.ref):
            return cached

        schema = EntityTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getEntityType",
                    arg={
                        "entityTypeId": self.ref,
                        "actorId": actor_id,
                    },
                )
            )["schema"],
        )

        model = create_model(
            slugify(self.ref, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=RootModel,
            root=(await schema.create_entity_type(actor_id=actor_id), ...),
        )
        self.cache[self.ref] = model
        return model


class EmptyDict(Schema):
    model_config = ConfigDict(title=None, extra="forbid")

    async def create_model(self, *, actor_id: UUID) -> type[None]:
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
    ) -> Annotated[Any, "PropertyTypeAnnotation"]:
        """Create an annotated type from this schema."""

        class EntityTypeAnnotation:
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
            await Object.create_model(self, actor_id=actor_id),
            EntityTypeAnnotation,
        ]
