from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)
U = TypeVar("U", bound=BaseModel)


def recast(type_: type[T], value: U) -> T:
    return type_.model_validate(value.model_dump(by_alias=True))
