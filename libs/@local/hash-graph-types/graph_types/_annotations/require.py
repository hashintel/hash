from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any, TypeVar, cast

from pydantic_core import CoreSchema, core_schema

if TYPE_CHECKING:
    from pydantic import GetCoreSchemaHandler

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
