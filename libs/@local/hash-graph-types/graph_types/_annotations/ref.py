from typing import TypeVar, Any, Annotated

from pydantic import GetJsonSchemaHandler, GetCoreSchemaHandler
from pydantic.json_schema import JsonSchemaValue, SkipJsonSchema
from pydantic_core import CoreSchema, core_schema, PydanticOmit

T = TypeVar("T")


class NotRequiredAnnotation:
    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        source_type: Any,  # noqa: ANN401
        handler: GetCoreSchemaHandler,
    ) -> CoreSchema:
        schema = handler(source_type)

        return core_schema.nullable_schema(schema)


def not_required(type_: type[T]) -> type[T]:
    return Annotated[type_, NotRequiredAnnotation]
