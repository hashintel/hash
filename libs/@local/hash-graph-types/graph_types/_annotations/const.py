from typing import Annotated, Any, TypeVar, cast, overload

from pydantic import GetCoreSchemaHandler, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema, core_schema

T = TypeVar("T")


class ConstAnnotation:
    const: Any

    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        source_type: Any,  # noqa: ANN401
        handler: GetCoreSchemaHandler,
    ) -> CoreSchema:
        schema = handler(source_type)

        return core_schema.no_info_after_validator_function(
            cls.validate_const,
            schema,
        )

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        schema: CoreSchema,
        handler: GetJsonSchemaHandler,
    ) -> JsonSchemaValue:
        json_schema = handler(schema)
        json_schema.update(const=cls.const)

        return json_schema

    @classmethod
    def validate_const(cls, v: T) -> T:
        if v != cls.const:
            msg = f"Value must be {cls.const}"
            raise ValueError(msg)

        return v


_Undefined = object()


@overload
def constant(const_: T, /) -> type[T]: ...


@overload
def constant(type_: type[T], const_: T, /) -> type[T]: ...


def constant(type_: type[T] | T, const_: T | object = _Undefined, /) -> type[T]:
    if const_ is _Undefined:
        value = cast(T, type_)
        ty = cast(type[T], type(const_))
    else:
        value = cast(T, const_)
        ty = cast(type[T], type_)

    class Annotation(ConstAnnotation):
        const = value

    return cast(type[T], Annotated[ty, Annotation])
