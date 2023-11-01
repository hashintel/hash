
# =========================================
# THIS FILE IS GENERATED, DO NOT CHANGE IT!
# =========================================

"""Blocking API for the Graph SDK.

This is just a thin wrapper around the async API.

(Usually, one could achieve this by simply wrapping the async API automatically,
the problem with that approach however is that users loose the ability to look
at the source code)
"""
from graph_sdk.client.concurrent import HASHClient as ConcurrentHASHClient
from graph_sdk.utils import async_to_sync
from typing import TypeVar
from uuid import UUID
from graph_client import GraphClient as LowLevelClient
from graph_client.models import CreateDataTypeRequest, CreateEntityTypeRequest, CreatePropertyTypeRequest, DataType, DataTypeStructuralQuery, EntityStructuralQuery, EntityType, EntityTypeStructuralQuery, LoadExternalDataTypeRequest, LoadExternalEntityTypeRequest, LoadExternalPropertyTypeRequest, MaybeListOfOntologyElementMetadata, OntologyElementMetadata, OwnedById, PropertyType, PropertyTypeStructuralQuery, Subgraph, UpdateDataType, UpdateDataTypeRequest, UpdateEntityType, UpdateEntityTypeRequest, UpdatePropertyType, UpdatePropertyTypeRequest, VersionedURL
from graph_types import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema
from pydantic_core._pydantic_core import Url
from yarl import URL
from graph_sdk.client._compat import recast
from graph_sdk.options import Options
from graph_sdk.query import BaseFilter
T = TypeVar('T')

class HASHClient:
    """Implementation of the client for the HASH API.

    Exposes several methods for interacting with the API.
    """
    inner: ConcurrentHASHClient

    def __init__(self, base: URL, *, actor: UUID | None=None) -> None:
        """Initialize the client with the base URL."""
        self.inner = ConcurrentHASHClient(base)

    @property
    def actor(self) -> UUID | None:
        """Get the actor for the client."""
        return self.inner.actor

    @actor.setter
    def actor(self, actor: UUID | None) -> None:
        """Set the actor for the client."""
        self.inner.actor = actor

    def query_data_types(self, query: BaseFilter, options: Options, *, actor: UUID | None=None) -> Subgraph:
        """Query data types."""
        return async_to_sync(self.inner.query_data_types(query, options, actor=actor))

    def load_external_data_type(self, url: URL, *, actor: UUID | None=None) -> OntologyElementMetadata:
        """Load an external data type."""
        return async_to_sync(self.inner.load_external_data_type(url, actor=actor))

    def create_data_types(self, models: list[DataTypeSchema], owned_by_id: UUID, *, actor: UUID | None=None) -> MaybeListOfOntologyElementMetadata:
        """Create data types."""
        return async_to_sync(self.inner.create_data_types(models, owned_by_id, actor=actor))

    def update_data_type(self, model: DataTypeSchema, *, actor: UUID | None=None) -> OntologyElementMetadata:
        """Update a data type."""
        return async_to_sync(self.inner.update_data_type(model, actor=actor))

    def query_property_types(self, query: BaseFilter, options: Options, *, actor: UUID | None=None) -> Subgraph:
        """Query property types."""
        return async_to_sync(self.inner.query_property_types(query, options, actor=actor))

    def load_external_property_type(self, url: URL, *, actor: UUID | None=None) -> OntologyElementMetadata:
        """Load an external property type."""
        return async_to_sync(self.inner.load_external_property_type(url, actor=actor))

    def create_property_types(self, models: list[PropertyTypeSchema], owned_by_id: UUID, *, actor: UUID | None=None) -> MaybeListOfOntologyElementMetadata:
        """Create property types."""
        return async_to_sync(self.inner.create_property_types(models, owned_by_id, actor=actor))

    def update_property_type(self, model: PropertyTypeSchema, *, actor: UUID | None=None) -> OntologyElementMetadata:
        """Update a property type."""
        return async_to_sync(self.inner.update_property_type(model, actor=actor))

    def query_entity_types(self, query: BaseFilter, options: Options, *, actor: UUID | None=None) -> Subgraph:
        """Query entity types."""
        return async_to_sync(self.inner.query_entity_types(query, options, actor=actor))

    def load_external_entity_type(self, url: URL, *, actor: UUID | None=None) -> OntologyElementMetadata:
        """Load an external entity type."""
        return async_to_sync(self.inner.load_external_entity_type(url, actor=actor))

    def create_entity_types(self, models: list[EntityTypeSchema], owned_by_id: UUID, *, actor: UUID | None=None) -> MaybeListOfOntologyElementMetadata:
        """Create entity types."""
        return async_to_sync(self.inner.create_entity_types(models, owned_by_id, actor=actor))

    def update_entity_type(self, model: EntityTypeSchema, *, actor: UUID | None=None) -> OntologyElementMetadata:
        """Update an entity type."""
        return async_to_sync(self.inner.update_entity_type(model, actor=actor))

    def query_entities(self, query: BaseFilter, options: Options, *, actor: UUID | None=None) -> Subgraph:
        """Query entities."""
        return async_to_sync(self.inner.query_entities(query, options, actor=actor))