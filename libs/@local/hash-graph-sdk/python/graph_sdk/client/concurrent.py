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
    RecordCreatedById,
    Subgraph,
    UpdateDataType,
    UpdateDataTypeRequest,
    UpdateEntityType,
    UpdateEntityTypeRequest,
    UpdatePropertyType,
    UpdatePropertyTypeRequest,
    VersionedURL,
    CreateEntityRequest,
    LinkData,
    EntityProperties,
    EntityMetadata,
    UpdateEntityRequest,
    EntityLinkOrder,
    EntityId,
)
from graph_types import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema
from graph_types.base import EntityType as GraphEntityType
from pydantic_core._pydantic_core import Url
from yarl import URL

from graph_sdk.client._compat import recast
from graph_sdk.entity import Entity
from graph_sdk.options import Options
from graph_sdk.query import BaseFilter

T = TypeVar("T")
U = TypeVar("U", bound=GraphEntityType)


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


# TODO: H-351: Use hash_graph_client for create_entity
#   https://linear.app/hash/issue/H-351
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
            data_type_id=VersionedURL(root=Url(str(url))),
            actor_id=RecordCreatedById(root=actor),
        )

        return await self.inner.load_external_data_type(request)

    async def create_data_types(
        self,
        models: list[DataTypeSchema],
        owned_by_id: UUID,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create data types."""
        actor = assert_not_none(self.actor)

        request = CreateDataTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[recast(DataType, model) for model in models],
        )

        return await self.inner.create_data_types(request)

    async def update_data_type(
        self,
        model: DataTypeSchema,
    ) -> OntologyElementMetadata:
        """Update a data type."""
        actor = assert_not_none(self.actor)

        request = UpdateDataTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            schema_=recast(UpdateDataType, model),
            type_to_update=VersionedURL(root=Url(model.identifier)),
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
            property_type_id=VersionedURL(root=Url(str(url))),
            actor_id=RecordCreatedById(root=actor),
        )

        return await self.inner.load_external_property_type(request)

    async def create_property_types(
        self,
        models: list[PropertyTypeSchema],
        owned_by_id: UUID,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create property types."""
        actor = assert_not_none(self.actor)

        request = CreatePropertyTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[recast(PropertyType, model) for model in models],
        )

        return await self.inner.create_property_types(request)

    async def update_property_type(
        self,
        model: PropertyTypeSchema,
    ) -> OntologyElementMetadata:
        """Update a property type."""
        actor = assert_not_none(self.actor)

        request = UpdatePropertyTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            schema_=recast(UpdatePropertyType, model),
            type_to_update=VersionedURL(root=Url(model.identifier)),
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
            entity_type_id=VersionedURL(root=Url(str(url))),
            actor_id=RecordCreatedById(root=actor),
        )

        return await self.inner.load_external_entity_type(request)

    async def create_entity_types(
        self,
        models: list[EntityTypeSchema],
        owned_by_id: UUID,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create entity types."""
        actor = assert_not_none(self.actor)

        request = CreateEntityTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            owned_by_id=OwnedById(root=owned_by_id),
            schema_=[recast(EntityType, model) for model in models],
        )

        return await self.inner.create_entity_types(request)

    async def update_entity_type(
        self,
        model: EntityTypeSchema,
    ) -> OntologyElementMetadata:
        """Update an entity type."""
        actor = assert_not_none(self.actor)

        request = UpdateEntityTypeRequest(
            actor_id=RecordCreatedById(root=actor),
            schema_=recast(UpdateEntityType, model),
            type_to_update=VersionedURL(root=Url(model.identifier)),
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

    async def create_entity(
        self,
        properties: U,
        *,
        link: LinkData | None = None,
        owned_by_id: UUID,
    ) -> Entity[U]:
        """Create an entity."""
        actor = assert_not_none(self.actor)

        request = CreateEntityRequest(
            actor_id=RecordCreatedById(root=actor),
            entity_type_id=VersionedURL(root=Url(properties.info.identifier)),
            entity_uuid=None,
            link_data=link,
            owned_by_id=OwnedById(root=owned_by_id),
            properties=EntityProperties.model_validate(
                properties.model_dump(by_alias=True)
            ),
        )

        metadata = await self.inner.create_entity(request)

        return Entity[type(properties)].from_create(metadata, link, properties)

    async def update_entity(
        self,
        entity: Entity[U],
    ) -> None:
        """Update an entity."""
        actor = assert_not_none(self.actor)

        request = UpdateEntityRequest(
            actor_id=RecordCreatedById(root=actor),
            archived=entity.archived,
            entity_id=entity.id.entity_id,
            entity_type_id=VersionedURL(root=Url(entity.properties.info.identifier)),
            left_to_right_link_order=entity.link.left_to_right_order,
            right_to_left_link_order=entity.link.right_to_left_order,
        )

        metadata = await self.inner.update_entity(request)
        entity.apply_metadata(metadata)
