"""Concurrent (async) client for the HASH API."""
from collections.abc import Generator
from contextlib import contextmanager
from typing import Self, TypeVar
from uuid import UUID

from graph_client import GraphClient as LowLevelClient
from graph_client.models import (
    CreateDataTypeRequest,
    CreateEntityTypeRequest,
    CreatePropertyTypeRequest,
    DataTypeStructuralQuery,
    EntityStructuralQuery,
    EntityTypeStructuralQuery,
    LoadExternalDataTypeRequest,
    LoadExternalEntityTypeRequest,
    LoadExternalPropertyTypeRequest,
    MaybeListOfOntologyElementMetadata,
    OntologyElementMetadata,
    OwnedById,
    PropertyTypeStructuralQuery,
    RecordCreatedById,
    Subgraph,
    UpdateDataTypeRequest,
    UpdateEntityTypeRequest,
    UpdatePropertyTypeRequest,
)
from yarl import URL

from graph_sdk.options import Options

T = TypeVar("T")


def assert_not_none(value: T | None) -> T:
    """Assert that the value is not None."""
    if value is None:
        msg = "value cannot be None"
        raise ValueError(msg)

    return value


@contextmanager
def with_actor(client: "HASHClient", actor: UUID) -> Generator[None, None, None]:
    """Context manager for setting the actor on the client."""
    old_actor = client.actor
    client.actor = actor
    yield
    client.actor = old_actor


class HASHClient:
    """Implementation of the client for the HASH API.

    Exposes several methods for interacting with the API.
    """

    inner: LowLevelClient
    actor: UUID | None = None

    def __init__(self, base: URL) -> None:
        """Initialize the client with the base URL."""
        self.inner = LowLevelClient(base)
        self.actor = None

    def with_actor(self, actor: UUID) -> Self:
        """Set the actor for the client."""
        self.actor = actor
        return self

    async def query_data_types(
        self,
        query: BaseFilter,
        options: Options,
    ) -> Subgraph:
        """Query data types."""
        request = DataTypeStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_data_types(request)

    async def load_external_data_type(self, url: URL) -> OntologyElementMetadata:
        """Load an external data type."""
        actor = assert_not_none(self.actor)

        request = LoadExternalDataTypeRequest(
            data_type_id=str(url),
            actor_id=RecordCreatedById(root=actor),
        )

        return await self.inner.load_external_data_type(request)

    async def create_data_types(
        self,
        models: list[DataType],
        owned_by_id: UUID,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create data types."""
        actor = assert_not_none(self.actor)

        request = CreateDataTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[model.to_ffi_schema() for model in models],
        )

        return await self.inner.create_data_types(request)

    async def update_data_type(
        self,
        model: DataType,
    ) -> OntologyElementMetadata:
        """Update a data type."""
        actor = assert_not_none(self.actor)

        request = UpdateDataTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            schema_=model.to_ffi_schema4(),
            type_to_update=str(model.id),
        )

        return await self.inner.update_data_type(request)

    async def query_property_types(
        self,
        query: BaseFilter,
        options: Options,
    ) -> Subgraph:
        """Query property types."""
        request = PropertyTypeStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_property_types(request)

    async def load_external_property_type(self, url: URL) -> OntologyElementMetadata:
        """Load an external property type."""
        actor = assert_not_none(self.actor)

        request = LoadExternalPropertyTypeRequest(
            property_type_id=str(url),
            actor_id=RecordCreatedById(root=actor),
        )

        return await self.inner.load_external_property_type(request)

    async def create_property_types(
        self,
        models: list[PropertyType],
        owned_by_id: UUID,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create property types."""
        actor = assert_not_none(self.actor)

        request = CreatePropertyTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[model.to_ffi_schema_model1() for model in models],
        )

        return await self.inner.create_property_types(request)

    async def update_property_type(
        self,
        model: PropertyType,
    ) -> OntologyElementMetadata:
        """Update a property type."""
        actor = assert_not_none(self.actor)

        request = UpdatePropertyTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            schema_=model.to_ffi_schema6(),
            type_to_update=str(model.id),
        )

        return await self.inner.update_property_type(request)

    async def query_entity_types(self, query: BaseFilter, options: Options) -> Subgraph:
        """Query entity types."""
        request = EntityTypeStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_entity_types(request)

    async def load_external_entity_type(self, url: URL) -> OntologyElementMetadata:
        """Load an external entity type."""
        actor = assert_not_none(self.actor)

        request = LoadExternalEntityTypeRequest(
            entity_type_id=str(url),
            actor_id=RecordCreatedById(root=actor),
        )

        return await self.inner.load_external_entity_type(request)

    async def create_entity_types(
        self,
        models: list[EntityType],
        owned_by_id: UUID,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create entity types."""
        actor = assert_not_none(self.actor)

        request = CreateEntityTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[model.to_ffi_schema_model() for model in models],
        )

        return await self.inner.create_entity_types(request)

    async def update_entity_type(
        self,
        model: EntityType,
    ) -> OntologyElementMetadata:
        """Update an entity type."""
        actor = assert_not_none(self.actor)

        request = UpdateEntityTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            schema_=model.to_ffi_schema5(),
            type_to_update=str(model.id),
        )

        return await self.inner.update_entity_type(request)

    async def query_entities(self, query: BaseFilter, options: Options) -> Subgraph:
        """Query entities."""
        request = EntityStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_entities(request)


# TODO: create_entity should use the hash graph client (same with update)
