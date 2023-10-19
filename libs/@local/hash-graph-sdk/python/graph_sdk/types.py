"""Create dynamic types from entity, property, and data types via pydantic."""

from uuid import UUID

from graph_types import (
    DataTypeSchema,
    EntityTypeSchema,
    PropertyTypeSchema,
)
from yarl import URL

from graph_sdk.client.concurrent import HASHClient
from graph_sdk.filter import (
    DataTypeQueryPath,
    EntityTypeQueryPath,
    PropertyTypeQueryPath,
)
from graph_sdk.options import Options
from graph_sdk.query import Parameter
from graph_sdk.utils import (
    async_to_sync,
    filter_latest_ontology_types_from_subgraph,
)


class TypeAPI:
    """GraphAPI for use with hash-graph-types."""

    inner: HASHClient

    def __init__(self, base: URL) -> None:
        """Initialize the client with the base URL."""
        self.inner = HASHClient(base)

    async def load_data_type(
        self,
        data_type_id: str,
        *,
        actor_id: UUID,
    ) -> DataTypeSchema:
        """Load an external data type."""
        await self.inner.load_external_data_type(URL(data_type_id), actor=actor_id)

        return await self.get_data_type(
            data_type_id,
            actor_id=actor_id,
            is_after_load=True,
        )

    async def get_data_type(
        self,
        data_type_id: str,
        *,
        actor_id: UUID,
        is_after_load: bool = False,
    ) -> DataTypeSchema:
        """Returns the data type schema for the given data type ID.

        If the data type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        TODO: remove this once H-136 is resolved.
        """
        subgraph = await self.inner.query_data_types(
            DataTypeQueryPath().versioned_url() == Parameter(data_type_id),
            Options(),
            actor=actor_id,
        )

        latest = filter_latest_ontology_types_from_subgraph(subgraph)
        if not latest:
            if is_after_load:
                msg = f"Could not find data type {data_type_id}"
                raise ValueError(msg)

            return await self.load_data_type(data_type_id, actor_id=actor_id)

        vertex = latest[0]
        data_type = vertex.root.inner.schema_

        return DataTypeSchema(**data_type.model_dump(by_alias=True, mode="json"))

    def get_data_type_sync(
        self,
        data_type_id: str,
        *,
        actor_id: UUID,
    ) -> DataTypeSchema:
        """Returns the data type schema for the given data type ID."""
        return async_to_sync(self.get_data_type(data_type_id, actor_id=actor_id))

    async def load_property_type(
        self,
        property_type_id: str,
        *,
        actor_id: UUID,
    ) -> PropertyTypeSchema:
        """Load an external property type."""
        await self.inner.load_external_property_type(
            URL(property_type_id),
            actor=actor_id,
        )

        return await self.get_property_type(
            property_type_id,
            actor_id=actor_id,
            is_after_load=True,
        )

    async def get_property_type(
        self,
        property_type_id: str,
        *,
        actor_id: UUID,
        is_after_load: bool = False,
    ) -> PropertyTypeSchema:
        """Returns the property type schema for the given property type ID.

        If the property type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        TODO: remove this once H-136 is resolved.
        """
        subgraph = await self.inner.query_property_types(
            PropertyTypeQueryPath().versioned_url() == Parameter(property_type_id),
            Options(),
            actor=actor_id,
        )

        latest = filter_latest_ontology_types_from_subgraph(subgraph)
        if not latest:
            if is_after_load:
                msg = f"Could not find property type {property_type_id}"
                raise ValueError(msg)

            return await self.load_property_type(property_type_id, actor_id=actor_id)

        vertex = latest[0]
        property_type = vertex.root.inner.schema_

        return PropertyTypeSchema(
            **property_type.model_dump(by_alias=True, mode="json"),
        )

    def get_property_type_sync(
        self,
        property_type_id: str,
        *,
        actor_id: UUID,
    ) -> PropertyTypeSchema:
        """Returns the property type schema for the given property type ID."""
        return async_to_sync(
            self.get_property_type(property_type_id, actor_id=actor_id),
        )

    async def load_entity_type(
        self,
        entity_type_id: str,
        *,
        actor_id: UUID,
    ) -> EntityTypeSchema:
        """Load an external entity type."""
        await self.inner.load_external_entity_type(
            URL(entity_type_id),
            actor=actor_id,
        )

        return await self.get_entity_type(
            entity_type_id,
            actor_id=actor_id,
            is_after_load=True,
        )

    async def get_entity_type(
        self,
        entity_type_id: str,
        *,
        actor_id: UUID,
        is_after_load: bool = False,
    ) -> EntityTypeSchema:
        """Returns the entity type schema for the given entity type ID.

        If the entity type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        TODO: remove this once H-136 is resolved.
        """
        subgraph = await self.inner.query_entity_types(
            EntityTypeQueryPath().versioned_url() == Parameter(entity_type_id),
            Options(),
            actor=actor_id,
        )

        latest = filter_latest_ontology_types_from_subgraph(subgraph)

        if not latest:
            if is_after_load:
                msg = f"Could not find entity type {entity_type_id}"
                raise ValueError(msg)

            return await self.load_entity_type(entity_type_id, actor_id=actor_id)

        vertex = latest[0]
        entity_type = vertex.root.inner.schema_

        return EntityTypeSchema(**entity_type.model_dump(by_alias=True, mode="json"))

    def get_entity_type_sync(
        self,
        entity_type_id: str,
        *,
        actor_id: UUID,
    ) -> EntityTypeSchema:
        """Returns the entity type schema for the given entity type ID."""
        return async_to_sync(self.get_entity_type(entity_type_id, actor_id=actor_id))
