from typing import Annotated, Any, TypeVar, cast

from pydantic import GetCoreSchemaHandler
from pydantic_core import CoreSchema, core_schema

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
    return cast(type[T], Annotated[type_, NotRequiredAnnotation])
