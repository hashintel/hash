"""Definition of high-level entities.

Entities are instantiated objects that are stored in the graph,
they can be created through the graph client.
"""
from typing import Generic, Self, TypeVar

from graph_client.models import (
    EntityId,
    EntityLinkOrder,
    EntityMetadata,
    EntityRecordId,
    EntityTemporalMetadata,
    LinkData,
    LinkOrder,
    ProvenanceMetadata,
)
from graph_types.base import EntityType
from pydantic import BaseModel

T = TypeVar("T", bound=EntityType)


class Link(BaseModel):
    """Aggregated link information for an entity."""

    left: EntityId | "Entity" | None = None
    right: EntityId | "Entity" | None = None

    left_to_right_order: LinkOrder | None = None
    right_to_left_order: LinkOrder | None = None

    @classmethod
    def from_ffi(cls, data: LinkData | None, order: EntityLinkOrder | None) -> Self:
        """Create a link from FFI data."""
        return cls(
            left=data.left_entity_id if data else None,
            right=data.right_entity_id if data else None,
            left_to_right_order=order.left_to_right_order if order else None,
            right_to_left_order=order.right_to_left_order if order else None,
        )


class Entity(BaseModel, Generic[T]):
    """An instantiated entity."""

    id: EntityRecordId  # noqa: A003

    properties: T

    link: Link | None = None

    archived: bool = False
    provenance: ProvenanceMetadata
    temporal: EntityTemporalMetadata

    def apply_metadata(self, metadata: EntityMetadata) -> None:
        """Apply metadata to the entity."""
        if self.properties.info.identifier != metadata.entity_type_id:
            msg = (
                f"Expected entity type {metadata.entity_type_id}, got"
                f" {self.properties.info.identifier}"
            )

            raise TypeError(msg)

        self.id = metadata.record_id

        self.archived = metadata.archived
        self.provenance = metadata.provenance
        self.temporal = metadata.temporal_versioning

    @classmethod
    def from_create(
        cls,
        meta: EntityMetadata,
        link: LinkData | None,
        properties: T,
    ) -> Self:
        """Create an entity from FFI data."""
        return cls(
            id=meta.record_id,
            properties=properties,
            link=Link.from_ffi(link, None),
            archived=meta.archived,
            provenance=meta.provenance,
            temporal=meta.temporal_versioning,
        )
