"""Blocking API for the Graph SDK.

This is just a thin wrapper around the async API.

(Usually, one could achieve this by simply wrapping the async API automatically,
the problem with that approach however is that users loose the ability to look
at the source code)
"""
from typing import Self, TypeVar
from uuid import UUID

from graph_client.models import (
    MaybeListOfOntologyElementMetadata,
    OntologyElementMetadata,
    Subgraph,
)
from graph_types import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema
from yarl import URL

from graph_sdk.client.concurrent import HASHClient as ConcurrentHASHClient
from graph_sdk.options import Options
from graph_sdk.query import BaseFilter
from graph_sdk.utils import async_to_sync

T = TypeVar("T")


class HASHClient:
    """Implementation of the client for the HASH API.

    Exposes several methods for interacting with the API.
    """

    inner: ConcurrentHASHClient

    def __init__(self, base: URL) -> None:
        """Initialize the client with the base URL."""
        self.inner = ConcurrentHASHClient(base)

    def with_actor(self, actor: UUID) -> Self:
        """Set the actor for the client."""
        self.inner.with_actor(actor)
        return self

    def query_data_types(self, query: BaseFilter, options: Options) -> Subgraph:
        """Query data types."""
        return async_to_sync(self.inner.query_data_types(query, options))

    def load_external_data_type(self, url: URL) -> OntologyElementMetadata:
        """Load an external data type."""
        return async_to_sync(self.inner.load_external_data_type(url))

    def create_data_types(
        self, models: list[DataTypeSchema], owned_by_id: UUID
    ) -> MaybeListOfOntologyElementMetadata:
        """Create data types."""
        return async_to_sync(self.inner.create_data_types(models, owned_by_id))

    def update_data_type(self, model: DataTypeSchema) -> OntologyElementMetadata:
        """Update a data type."""
        return async_to_sync(self.inner.update_data_type(model))

    def query_property_types(self, query: BaseFilter, options: Options) -> Subgraph:
        """Query property types."""
        return async_to_sync(self.inner.query_property_types(query, options))

    def load_external_property_type(self, url: URL) -> OntologyElementMetadata:
        """Load an external property type."""
        return async_to_sync(self.inner.load_external_property_type(url))

    def create_property_types(
        self, models: list[PropertyTypeSchema], owned_by_id: UUID
    ) -> MaybeListOfOntologyElementMetadata:
        """Create property types."""
        return async_to_sync(self.inner.create_property_types(models, owned_by_id))

    def update_property_type(
        self, model: PropertyTypeSchema
    ) -> OntologyElementMetadata:
        """Update a property type."""
        return async_to_sync(self.inner.update_property_type(model))

    def query_entity_types(self, query: BaseFilter, options: Options) -> Subgraph:
        """Query entity types."""
        return async_to_sync(self.inner.query_entity_types(query, options))

    def load_external_entity_type(self, url: URL) -> OntologyElementMetadata:
        """Load an external entity type."""
        return async_to_sync(self.inner.load_external_entity_type(url))

    def create_entity_types(
        self, models: list[EntityTypeSchema], owned_by_id: UUID
    ) -> MaybeListOfOntologyElementMetadata:
        """Create entity types."""
        return async_to_sync(self.inner.create_entity_types(models, owned_by_id))

    def update_entity_type(self, model: EntityTypeSchema) -> OntologyElementMetadata:
        """Update an entity type."""
        return async_to_sync(self.inner.update_entity_type(model))

    def query_entities(self, query: BaseFilter, options: Options) -> Subgraph:
        """Query entities."""
        return async_to_sync(self.inner.query_entities(query, options))
