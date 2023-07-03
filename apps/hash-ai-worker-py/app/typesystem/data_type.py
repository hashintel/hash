"""A data type schema as defined by the Block Protocol."""
from typing import Literal

from typing import Annotated, Any, ClassVar, TypeAlias
from uuid import UUID

from pydantic import (
    Extra,
    Field,
    GetCoreSchemaHandler,
    GetJsonSchemaHandler,
    RootModel,
    create_model,
)
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema, core_schema
from slugify import slugify
from temporalio import workflow

from ._schema import OntologyTypeSchema, Schema

__all__ = ["DataTypeSchema"]

DataType: TypeAlias = str | float | bool | None | list[Any] | dict[str, Any]


class DataTypeReference(Schema):
    ref: str = Field(..., alias="$ref")
    cache: ClassVar[dict[str, type[RootModel]]] = {}

    async def create_model(self, *, actor_id: UUID) -> type[RootModel]:
        if cached := self.cache.get(self.ref):
            return cached

        schema = DataTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getDataType",
                    arg={
                        "dataTypeId": self.ref,
                        "actorId": actor_id,
                    },
                )
            )["schema"],
        )

        model = create_model(
            slugify(self.ref, regex_pattern=r"[^a-z0-9_]+", separator="_"),
            __base__=RootModel,
            root=(await schema.create_data_type(actor_id=actor_id), Field(...)),
        )
        self.cache[self.ref] = model
        return model


class DataTypeSchema(OntologyTypeSchema, extra=Extra.allow):
    """A data type schema as defined by the Block Protocol.

    see https://blockprotocol.org/types/modules/graph/0.3/schema/data-type
    """

    kind: Literal["dataType"]
    ty: str = Field(..., alias="type")

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
            case _:
                # TODO: activities should never raise an exception, but instead return
                #  an error value that the workflow can handle.
                #  https://app.asana.com/0/0/1204934059777411/f
                msg = f"Unknown type: {self.ty}"
                raise ValueError(msg)

    async def create_data_type(
        self,
        *,
        actor_id: UUID,
    ) -> Annotated[Any, "DataTypeAnnotation"]:
        """Create an annotated type from this schema."""
        # Custom data types will require an actor ID to be passed in
        _actor_id = actor_id

        const = self.model_extra.get("const") if self.model_extra else None

        # TODO: Use `Field` instead when multiple fields are supported
        #   https://github.com/pydantic/pydantic/issues/6349
        #   https://github.com/pydantic/pydantic/issues/6353
        class DataTypeAnnotation:
            @classmethod
            def __get_pydantic_core_schema__(
                cls,
                source_type: Any,  # noqa: ANN401
                handler: GetCoreSchemaHandler,
            ) -> CoreSchema:
                schema = handler(source_type)
                if const is not None:
                    return core_schema.no_info_after_validator_function(
                        cls.validate_const,
                        schema,
                    )
                return schema

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
                if const is not None:
                    json_schema.update(const=const)

                return json_schema

            @classmethod
            def validate_const(cls, v: DataType) -> None:
                if v != const:
                    msg = f"Value must be {const}"
                    raise ValueError(msg)

        return Annotated[self._type(), DataTypeAnnotation]
