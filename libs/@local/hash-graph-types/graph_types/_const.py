from typing import Annotated, Any, TypeVar

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


class Const:
    def __class_getitem__(cls, item: tuple[type[T], T] | T) -> T:
        if isinstance(item, tuple):
            if len(item) != 2:  # noqa: PLR2004
                msg = "Const must be a tuple of length 2"
                raise ValueError(msg)

            type_, const_ = item

            if not isinstance(const_, type_):
                msg = "Const value must be an instance of the type"
                raise TypeError(msg)
        else:
            type_ = type(item)
            const_ = item

        class Annotation(ConstAnnotation):
            const = const_

        return Annotated[type_, Annotation]
