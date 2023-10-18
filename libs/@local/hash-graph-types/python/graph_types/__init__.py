"""Replicates the Block Protocol type system for use in Python."""

from typing import Protocol
from uuid import UUID

# This solution is not great as it _could_ lead to circular imports. However,
# it is the best solution we have for now. The alternative is to have a single
# file that contains all the schemas, but that is not very maintainable.
#
# If we run into issues with circular imports, we can refactor this to use
# direct imports. For example, instead of importing `DataTypeSchema` from
# `graph_types`, we can import it from `graph_types.data_type`.
from .data_type import DataTypeReference as DataTypeReference
from .data_type import DataTypeSchema as DataTypeSchema
from .entity_type import EntityTypeReference as EntityTypeReference
from .entity_type import EntityTypeSchema as EntityTypeSchema
from .property_type import PropertyTypeReference as PropertyTypeReference
from .property_type import PropertyTypeSchema as PropertyTypeSchema


class GraphAPIProtocol(Protocol):
    """Defines the interface for a graph API."""

    async def get_data_type(
        self,
        data_type_id: str,
        *,
        actor_id: UUID,
    ) -> DataTypeSchema:
        """Returns the data type schema for the given data type ID.

        If the data type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        """
        ...

    async def get_property_type(
        self,
        property_type_id: str,
        *,
        actor_id: UUID,
    ) -> PropertyTypeSchema:
        """Returns the property type schema for the given property type ID.

        If the property type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        """
        ...

    async def get_entity_type(
        self,
        entity_type_id: str,
        *,
        actor_id: UUID,
    ) -> EntityTypeSchema:
        """Returns the entity type schema for the given entity type ID.

        If the entity type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        """
        ...
