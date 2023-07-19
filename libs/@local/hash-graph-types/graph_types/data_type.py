"""A data type schema as defined by the Block Protocol."""
from typing import (
    TYPE_CHECKING,
    Annotated,
    Any,
    ClassVar,
    Literal,
    TypeAlias,
    assert_never,
)
from uuid import UUID

from pydantic import (
    Extra,
    Field,
    RootModel,
    create_model,
)
from slugify import slugify

from ._schema import OntologyTypeSchema, Schema
from .base import DataType as DataTypeBase

if TYPE_CHECKING:
    from . import GraphAPIProtocol

__all__ = ["DataTypeSchema", "DataTypeReference"]

DataType: TypeAlias = str | float | bool | None | list[Any] | dict[str, Any]


class DataTypeReference(Schema):
    """A reference to a data type schema."""

    ref: str = Field(..., alias="$ref")
    cache: ClassVar[dict[str, type[RootModel]]] = {}

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[RootModel]:
        """Creates a model from the referenced data type schema."""
        if cached := self.cache.get(self.ref):
            return cached

        schema = await graph.get_data_type(self.ref, actor_id=actor_id)

        model = create_model(
            slugify(self.ref, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=RootModel,
            root=(
                await schema.create_data_type(actor_id=actor_id, graph=graph),
                Field(...),
            ),
        )
        self.cache[self.ref] = model
        return model


class DataTypeSchema(OntologyTypeSchema, extra=Extra.allow):
    """A data type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/data-type
    """

    kind: Literal["dataType"]
    ty: Literal["string", "number", "boolean", "null", "array", "object"] = Field(
        ...,
        alias="type",
    )

    def _type(self) -> type[DataType]:
        match self.ty:
            case "string":
                return str
            case "number":
                return float
            case "boolean":
                return bool
            case "null":
                return type(None)
            case "array":
                return list[Any]
            case "object":
                return dict[str, Any]
            case _ as unreachable:
                assert_never(unreachable)

    async def create_data_type(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[RootModel]:
        """Create an annotated type from this schema."""
        # Custom data types will require an actor ID and the graph to be passed in
        _actor_id = actor_id
        _graph = graph

        const = self.model_extra.get("const") if self.model_extra else None

        type_ = Literal[const] if const is not None else self._type()

        return create_model(
            slugify(self.id, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=(RootModel[type_], DataTypeBase),
            __cls_kwargs__={"info": self.type_info()},
            root=(Field(...), ...),
        )
