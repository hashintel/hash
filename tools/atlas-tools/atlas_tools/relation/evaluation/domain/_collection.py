"""Freeze validated mappings while preserving their ordinary JSON shape."""

from collections.abc import Mapping
from types import MappingProxyType
from typing import Annotated

from pydantic import AfterValidator, PlainSerializer


def _freeze_mapping[Key, Value](value: Mapping[Key, Value]) -> Mapping[Key, Value]:
    return MappingProxyType(dict(value))


def _mapping_json[Key, Value](value: Mapping[Key, Value]) -> dict[Key, Value]:
    return dict(value)


type FrozenMapping[Key, Value] = Annotated[
    Mapping[Key, Value],
    AfterValidator(_freeze_mapping),
    PlainSerializer(_mapping_json, return_type=dict),
]

