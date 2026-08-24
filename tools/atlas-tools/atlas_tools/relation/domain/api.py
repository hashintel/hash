"""Define strict domain contracts shared across relation subsystems."""

import re
from collections.abc import Mapping
from types import MappingProxyType
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    PlainSerializer,
    StringConstraints,
)
from pydantic_core import CoreSchema, core_schema

from atlas_tools.common import Sha256Hex

_RELATION_NAMESPACE = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
_CONTROL_CHARACTER_BOUND = 32


def _freeze_mapping[Key, Value](value: Mapping[Key, Value]) -> Mapping[Key, Value]:
    return MappingProxyType(dict(value))


def _mapping_json[Key, Value](value: Mapping[Key, Value]) -> dict[Key, Value]:
    return dict(value)


def _validate_relation_id(value: str) -> str:
    namespace, separator, local_id = value.partition(":")
    if not separator:
        raise ValueError("relation_id must use namespace:local_id form")
    if _RELATION_NAMESPACE.fullmatch(namespace) is None:
        raise ValueError(f"invalid relation namespace {namespace!r}")
    if not local_id or local_id != local_id.strip():
        raise ValueError("relation local_id must be non-empty and have no outer whitespace")
    if any(ord(character) < _CONTROL_CHARACTER_BOUND for character in local_id):
        raise ValueError("relation local_id must not contain control characters")
    return value


type NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]
type RelationNamespace = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$"),
]
type RelationId = Annotated[str, AfterValidator(_validate_relation_id)]
type FrozenMapping[Key, Value] = Annotated[
    Mapping[Key, Value],
    AfterValidator(_freeze_mapping),
    PlainSerializer(_mapping_json, return_type=dict),
]


class NonEmptyStringId(str):
    """Provide one strict, Pydantic-aware base for durable string identities."""

    __slots__ = ()

    def __new__(cls, value: str) -> Self:
        if not isinstance(value, str):
            raise TypeError(f"{cls.__name__} requires a string")
        if not value:
            raise ValueError(f"{cls.__name__} must not be empty")
        return str.__new__(cls, value)

    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        _source_type: object,
        _handler: object,
    ) -> CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls,
            core_schema.str_schema(strict=True, min_length=1),
        )


class RelationFamilyId(NonEmptyStringId):
    """Identify one relation cohort used for grouped classifier evidence."""


class FrozenModel(BaseModel):
    """Reject coercion and unknown fields for immutable relation contracts."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )


class RelationSourceSpec(FrozenModel):
    """Declare one relation namespace and its source-local identity field."""

    namespace: RelationNamespace
    local_id_field: NonEmptyStr


def qualify_relation_id(namespace: RelationNamespace | str, local_id: object) -> RelationId:
    """Return the stable serialized identity for one source-local relation."""
    return _validate_relation_id(f"{namespace}:{local_id}")


def split_relation_id(relation_id: RelationId | str) -> tuple[RelationNamespace, str]:
    """Split a qualified ID at its first separator, preserving local-ID colons."""
    validated = _validate_relation_id(relation_id)
    namespace, _, local_id = validated.partition(":")
    return namespace, local_id


__all__ = [
    "FrozenMapping",
    "FrozenModel",
    "NonEmptyStr",
    "NonEmptyStringId",
    "RelationFamilyId",
    "RelationId",
    "RelationNamespace",
    "RelationSourceSpec",
    "Sha256Hex",
    "qualify_relation_id",
    "split_relation_id",
]
