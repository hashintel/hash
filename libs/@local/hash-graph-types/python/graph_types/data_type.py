"""A data type schema as defined by the Block Protocol."""

from typing import (
    TYPE_CHECKING,
    Any,
    Literal,
    TypeAlias,
    assert_never,
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

from ._annotations import constant
from ._schema import OntologyTypeSchema, Schema

if TYPE_CHECKING:
    from . import GraphAPIProtocol
    from .base import DataType as DataTypeBase

__all__ = ["DataTypeSchema", "DataTypeReference"]

DataType: TypeAlias = str | float | bool | None | list[Any] | dict[str, Any]


class DataTypeReference(Schema):
    """A reference to a data type schema."""

    ref: str = Field(..., alias="$ref")

    async def create_model(
        self,
        *,
        actor_id: UUID,
        graph: "GraphAPIProtocol",
        additional_properties: bool,
    ) -> type["DataTypeBase"]:
        """Creates a model from the referenced data type schema."""
        schema = await graph.get_data_type(self.ref, actor_id=actor_id)
        return await schema.create_model(
            actor_id=actor_id,
            graph=graph,
            additional_properties=additional_properties,
        )


class DataTypeSchema(OntologyTypeSchema, extra="allow"):
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
        additional_properties: bool,  # noqa: ARG002
    ) -> type["DataTypeBase"]:
        """Create an annotated type from this schema."""
        from .base import DataType as DataTypeBase

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
