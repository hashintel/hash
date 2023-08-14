"""Client for the HASH API."""
from typing import Literal, TypeAlias, TypeVar

import httpx
from pydantic import BaseModel
from yarl import URL

from graph_client.models import (
    CreateDataTypeRequest,
    CreateEntityRequest,
    CreateEntityTypeRequest,
    CreatePropertyTypeRequest,
    DataTypeQueryToken,
    DataTypeStructuralQuery,
    EntityMetadata,
    EntityQueryToken,
    EntityStructuralQuery,
    EntityTypeQueryToken,
    EntityTypeStructuralQuery,
    LoadExternalDataTypeRequest,
    LoadExternalEntityTypeRequest,
    LoadExternalPropertyTypeRequest,
    MaybeListOfOntologyElementMetadata,
    OntologyElementMetadata,
    PropertyTypeQueryToken,
    PropertyTypeStructuralQuery,
    Selector,
    Subgraph,
    UpdateDataTypeRequest,
    UpdateEntityRequest,
    UpdateEntityTypeRequest,
    UpdatePropertyTypeRequest,
)

T = TypeVar("T", bound=BaseModel)

QueryToken: TypeAlias = (
    DataTypeQueryToken
    | PropertyTypeQueryToken
    | EntityTypeQueryToken
    | EntityQueryToken
    | Selector
    | str
    | float
)

__all__ = ["GraphClient", "QueryToken", "models"]


async def _send_request(
    endpoint: URL,
    method: Literal["POST", "PUT"],
    body: BaseModel,
    response_t: type[T],
) -> T:
    """Send a request to the HASH API."""
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method,
            str(endpoint),
            json=body.model_dump(by_alias=True, mode="json"),
        )

    response.raise_for_status()

    json = response.json()
    return response_t.model_validate(json, strict=False)


class GraphClient:
    """Low-level implementation of the client for the HASH API."""

    base: URL

    def __init__(self, base: URL) -> None:
        """Initialize the client with the base URL."""
        self.base = base

    async def query_entity_types(self, query: EntityTypeStructuralQuery) -> Subgraph:
        """Query the HASH API for entity types."""
        endpoint = self.base / "entity-types" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            Subgraph,
        )

    async def load_external_entity_type(
        self,
        request: LoadExternalEntityTypeRequest,
    ) -> OntologyElementMetadata:
        """Load an external entity type."""
        endpoint = self.base / "entity-types" / "load"

        return await _send_request(
            endpoint,
            "POST",
            request,
            OntologyElementMetadata,
        )

    async def create_entity_types(
        self,
        request: CreateEntityTypeRequest,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create an entity type."""
        endpoint = self.base / "entity-types"

        return await _send_request(
            endpoint,
            "POST",
            request,
            MaybeListOfOntologyElementMetadata,
        )

    async def update_entity_type(
        self,
        request: UpdateEntityTypeRequest,
    ) -> OntologyElementMetadata:
        """Update an entity type."""
        endpoint = self.base / "entity-types"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            OntologyElementMetadata,
        )

    async def query_property_types(
        self,
        query: PropertyTypeStructuralQuery,
    ) -> Subgraph:
        """Query the HASH API for property types."""
        endpoint = self.base / "property-types" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            Subgraph,
        )

    async def load_external_property_type(
        self,
        request: LoadExternalPropertyTypeRequest,
    ) -> OntologyElementMetadata:
        """Load an external property type."""
        endpoint = self.base / "property-types" / "load"

        return await _send_request(
            endpoint,
            "POST",
            request,
            OntologyElementMetadata,
        )

    async def create_property_types(
        self,
        request: CreatePropertyTypeRequest,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create a property type."""
        endpoint = self.base / "property-types"

        return await _send_request(
            endpoint,
            "POST",
            request,
            MaybeListOfOntologyElementMetadata,
        )

    async def update_property_type(
        self,
        request: UpdatePropertyTypeRequest,
    ) -> OntologyElementMetadata:
        """Update a property type."""
        endpoint = self.base / "property-types"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            OntologyElementMetadata,
        )

    async def query_data_types(self, query: DataTypeStructuralQuery) -> Subgraph:
        """Query the HASH API for data types."""
        endpoint = self.base / "data-types" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            Subgraph,
        )

    async def load_external_data_type(
        self,
        request: LoadExternalDataTypeRequest,
    ) -> OntologyElementMetadata:
        """Load an external data type."""
        endpoint = self.base / "data-types" / "load"

        return await _send_request(
            endpoint,
            "POST",
            request,
            OntologyElementMetadata,
        )

    async def create_data_types(
        self,
        request: CreateDataTypeRequest,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create a data type."""
        endpoint = self.base / "data-types"

        return await _send_request(
            endpoint,
            "POST",
            request,
            MaybeListOfOntologyElementMetadata,
        )

    async def update_data_type(
        self,
        request: UpdateDataTypeRequest,
    ) -> OntologyElementMetadata:
        """Update a data type."""
        endpoint = self.base / "data-types"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            OntologyElementMetadata,
        )

    async def query_entities(self, query: EntityStructuralQuery) -> Subgraph:
        """Query the HASH API for entities."""
        endpoint = self.base / "entities" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            Subgraph,
        )

    async def create_entity(self, request: CreateEntityRequest) -> EntityMetadata:
        """Create an entity."""
        endpoint = self.base / "entities"

        return await _send_request(
            endpoint,
            "POST",
            request,
            EntityMetadata,
        )

    async def update_entity(self, request: UpdateEntityRequest) -> EntityMetadata:
        """Update an entity."""
        endpoint = self.base / "entities"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            EntityMetadata,
        )
