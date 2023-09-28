"""A data type schema as defined by the Block Protocol."""
from typing import (
    TYPE_CHECKING,
    Any,
    ClassVar,
    Literal,
    TypeAlias,
    assert_never,
    cast,
)
from uuid import UUID

from pydantic import (
    BaseModel,
    Extra,
    Field,
    RootModel,
    create_model,
)
from slugify import slugify

from ._annotations import constant
from ._cache import Cache
from ._schema import OntologyTypeSchema, Schema
from .base import DataType as DataTypeBase

if TYPE_CHECKING:
    from . import GraphAPIProtocol

__all__ = ["DataTypeSchema", "DataTypeReference"]

DataType: TypeAlias = str | float | bool | None | list[Any] | dict[str, Any]


async def fetch_model(
    ref: str,
    *,
    actor_id: UUID,
    graph: "GraphAPIProtocol",
) -> type[DataTypeBase]:
    schema = await graph.get_data_type(ref, actor_id=actor_id)
    return await schema.create_model(actor_id=actor_id, graph=graph)


class DataTypeReference(Schema):
    """A reference to a data type schema."""

    ref: str = Field(..., alias="$ref")
    _cache: ClassVar[Cache[type[DataTypeBase]]] = Cache()

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[DataTypeBase]:
        """Creates a model from the referenced data type schema."""
        return await self._cache.get(
            self.ref,
            on_miss=lambda: fetch_model(self.ref, actor_id=actor_id, graph=graph),
        )


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

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
    ) -> type[DataTypeBase]:
        """Create an annotated type from this schema."""
        # Custom data types will require an actor ID and the graph to be passed in
        _actor_id = actor_id
        _graph = graph

        type_ = self._type()
        if "const" in (self.model_extra or {}):
            # `const` can only be in `model_extra`, therefore it is safe to index!
            const = self.model_extra["const"]  # type: ignore[index]
            type_ = constant(type_, const)

        class_name = slugify(
            self.identifier,
            regex_pattern=r"[^a-z0-9_]+",
            separator="_",
        )

        base: type[BaseModel] = type(
            f"{class_name}Base",
            (DataTypeBase,),
            {"info": self.type_info()},
        )

        return cast(
            type[DataTypeBase],
            create_model(
                class_name,
                __base__=(base, RootModel),
                root=(type_, Field(...)),
            ),
        )
