"""Shared relation-card row and source-qualified identity types."""

import re
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    NonNegativeInt,
    StringConstraints,
)

from atlas_tools.common import Sha256Hex

_RELATION_NAMESPACE = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
_CONTROL_CHARACTER_BOUND = 32


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


type RelationNamespace = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$"),
]
type RelationId = Annotated[str, AfterValidator(_validate_relation_id)]


def qualify_relation_id(namespace: RelationNamespace | str, local_id: object) -> RelationId:
    """Return the stable serialized identity for one source-local relation."""
    return _validate_relation_id(f"{namespace}:{local_id}")


def split_relation_id(relation_id: RelationId | str) -> tuple[RelationNamespace, str]:
    """Split a qualified ID at its first separator, preserving colons in local IDs."""
    validated = _validate_relation_id(relation_id)
    namespace, _, local_id = validated.partition(":")
    return namespace, local_id


class RelationSourceSpec(BaseModel):
    """Identity declaration carried by every card-set manifest."""

    namespace: RelationNamespace
    local_id_field: str

    model_config = ConfigDict(extra="forbid", frozen=True)


class CardRow(BaseModel):
    card_text: str
    card_hash: Sha256Hex

    token_count: NonNegativeInt
    truncations: list[str]

    severely_truncated: bool

    model_config = ConfigDict(extra="allow")
