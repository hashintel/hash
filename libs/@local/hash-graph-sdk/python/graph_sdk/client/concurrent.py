"""Concurrent (async) client for the HASH API."""

from typing import TypeVar
from uuid import UUID

from graph_client import GraphClient as LowLevelClient
from graph_client.models import (
    CreateDataTypeRequest,
    CreateEntityTypeRequest,
    CreatePropertyTypeRequest,
    DataType,
    DataTypeStructuralQuery,
    EntityStructuralQuery,
    EntityType,
    EntityTypeStructuralQuery,
    LoadExternalDataTypeRequest,
    LoadExternalEntityTypeRequest,
    LoadExternalPropertyTypeRequest,
    MaybeListOfOntologyElementMetadata,
    OntologyElementMetadata,
    OwnedById,
    PropertyType,
    PropertyTypeStructuralQuery,
    Subgraph,
    UpdateDataType,
    UpdateDataTypeRequest,
    UpdateEntityType,
    UpdateEntityTypeRequest,
    UpdatePropertyType,
    UpdatePropertyTypeRequest,
    VersionedURL,
)
from graph_types import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema
from pydantic_core._pydantic_core import Url
from yarl import URL

from graph_sdk.client._compat import recast
from graph_sdk.options import Options
from graph_sdk.query import BaseFilter

T = TypeVar("T")


def assert_not_none(value: T | None) -> T:
    """Assert that the value is not None."""
    if value is None:
        msg = "value cannot be None"
        raise ValueError(msg)

    return value


# TODO: H-351: Use hash_graph_client for create_entity
#   https://linear.app/hash/issue/H-351
class HASHClient:
    """Implementation of the client for the HASH API.

    Exposes several methods for interacting with the API.
    """

    inner: LowLevelClient

    def __init__(self, base: URL, *, actor: UUID | None = None) -> None:
        """Initialize the client with the base URL."""
        self.inner = LowLevelClient(base, actor=actor)
        self.actor = None

    @property
    def actor(self) -> UUID | None:
        """Get the actor for the client."""
        return self.inner.actor

    @actor.setter
    def actor(self, actor: UUID | None) -> None:
        """Set the actor for the client."""
        self.inner.actor = actor

    async def query_data_types(
        self,
        query: BaseFilter,
        options: Options,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query data types."""
        request = DataTypeStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_data_types(request, actor=actor)

    async def load_external_data_type(
        self,
        url: URL,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Load an external data type."""
        request = LoadExternalDataTypeRequest(
            data_type_id=VersionedURL(root=Url(str(url))),
        )

        return await self.inner.load_external_data_type(request, actor=actor)

    async def create_data_types(
        self,
        models: list[DataTypeSchema],
        owned_by_id: UUID,
        *,
        actor: UUID | None = None,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create data types."""
        request = CreateDataTypeRequest(
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[recast(DataType, model) for model in models],
        )

        return await self.inner.create_data_types(request, actor=actor)

    async def update_data_type(
        self,
        model: DataTypeSchema,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Update a data type."""
        request = UpdateDataTypeRequest(
            schema_=recast(UpdateDataType, model),
            type_to_update=VersionedURL(root=Url(model.identifier)),
        )

        return await self.inner.update_data_type(request, actor=actor)

    async def query_property_types(
        self,
        query: BaseFilter,
        options: Options,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query property types."""
        request = PropertyTypeStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_property_types(request, actor=actor)

    async def load_external_property_type(
        self,
        url: URL,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Load an external property type."""
        request = LoadExternalPropertyTypeRequest(
            property_type_id=VersionedURL(root=Url(str(url))),
        )

        return await self.inner.load_external_property_type(request, actor=actor)

    async def create_property_types(
        self,
        models: list[PropertyTypeSchema],
        owned_by_id: UUID,
        *,
        actor: UUID | None = None,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create property types."""
        request = CreatePropertyTypeRequest(
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[recast(PropertyType, model) for model in models],
        )

        return await self.inner.create_property_types(request, actor=actor)

    async def update_property_type(
        self,
        model: PropertyTypeSchema,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Update a property type."""
        request = UpdatePropertyTypeRequest(
            schema_=recast(UpdatePropertyType, model),
            type_to_update=VersionedURL(root=Url(model.identifier)),
        )

        return await self.inner.update_property_type(request, actor=actor)

    async def query_entity_types(
        self,
        query: BaseFilter,
        options: Options,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query entity types."""
        request = EntityTypeStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_entity_types(request, actor=actor)

    async def load_external_entity_type(
        self,
        url: URL,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Load an external entity type."""
        request = LoadExternalEntityTypeRequest(
            entity_type_id=VersionedURL(root=Url(str(url))),
        )

        return await self.inner.load_external_entity_type(request, actor=actor)

    async def create_entity_types(
        self,
        models: list[EntityTypeSchema],
        owned_by_id: UUID,
        *,
        actor: UUID | None = None,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create entity types."""
        request = CreateEntityTypeRequest(
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[recast(EntityType, model) for model in models],
        )

        return await self.inner.create_entity_types(request, actor=actor)

    async def update_entity_type(
        self,
        model: EntityTypeSchema,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Update an entity type."""
        request = UpdateEntityTypeRequest(
            schema_=recast(UpdateEntityType, model),
            type_to_update=VersionedURL(root=Url(model.identifier)),
        )

        return await self.inner.update_entity_type(request, actor=actor)

    async def query_entities(
        self,
        query: BaseFilter,
        options: Options,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query entities."""
        request = EntityStructuralQuery(
            filter=query.to_ffi(),
            graph_resolve_depths=options.graph_resolve_depth,
            temporal_axes=options.temporal_axes,
        )

        return await self.inner.query_entities(request, actor=actor)
