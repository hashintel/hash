from typing import Annotated, TypeVar

from pydantic import GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import CoreSchema

T = TypeVar("T")


class OmitDefaultAnnotation:
    @classmethod
    def __get_pydantic_json_schema__(
        cls, schema: CoreSchema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        json_schema = handler(schema)
        print(json_schema)
        json_schema.pop("default", None)
        return json_schema


def omit_default(type_: type[T], /) -> type[T]:
    return Annotated[type_, OmitDefaultAnnotation]
