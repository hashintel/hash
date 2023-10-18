"""Client for the HASH API."""

from typing import Literal, TypeAlias, TypeVar
from uuid import UUID

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
    actor: UUID,
    response_t: type[T],
) -> T:
    """Send a request to the HASH API."""
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method,
            str(endpoint),
            json=body.model_dump(by_alias=True, mode="json"),
            headers={
                "X-Authenticated-User-Actor-Id": str(actor),
            },
        )

    response.raise_for_status()

    json = response.json()
    return response_t.model_validate(json, strict=False)


U = TypeVar("U")


def _assert_not_none(value: U | None) -> U:
    """Assert that the value is not None."""
    if value is None:
        msg = "value cannot be None"
        raise ValueError(msg)

    return value


class GraphClient:
    """Low-level implementation of the client for the HASH API."""

    base: URL
    actor: UUID | None

    def __init__(self, base: URL, *, actor: UUID | None = None) -> None:
        """Initialize the client with the base URL."""
        self.base = base
        self.actor = actor

    def _actor(self, override: UUID | None = None) -> UUID:
        """Get the actor for the client."""
        actor = override or self.actor
        return _assert_not_none(actor)

    async def query_entity_types(
        self,
        query: EntityTypeStructuralQuery,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query the HASH API for entity types."""
        endpoint = self.base / "entity-types" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            self._actor(actor),
            Subgraph,
        )

    async def load_external_entity_type(
        self,
        request: LoadExternalEntityTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Load an external entity type."""
        endpoint = self.base / "entity-types" / "load"

        return await _send_request(
            endpoint,
            "POST",
            request,
            self._actor(actor),
            OntologyElementMetadata,
        )

    async def create_entity_types(
        self,
        request: CreateEntityTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create an entity type."""
        endpoint = self.base / "entity-types"

        return await _send_request(
            endpoint,
            "POST",
            request,
            self._actor(actor),
            MaybeListOfOntologyElementMetadata,
        )

    async def update_entity_type(
        self,
        request: UpdateEntityTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Update an entity type."""
        endpoint = self.base / "entity-types"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            self._actor(actor),
            OntologyElementMetadata,
        )

    async def query_property_types(
        self,
        query: PropertyTypeStructuralQuery,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query the HASH API for property types."""
        endpoint = self.base / "property-types" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            self._actor(actor),
            Subgraph,
        )

    async def load_external_property_type(
        self,
        request: LoadExternalPropertyTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Load an external property type."""
        endpoint = self.base / "property-types" / "load"

        return await _send_request(
            endpoint,
            "POST",
            request,
            self._actor(actor),
            OntologyElementMetadata,
        )

    async def create_property_types(
        self,
        request: CreatePropertyTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create a property type."""
        endpoint = self.base / "property-types"

        return await _send_request(
            endpoint,
            "POST",
            request,
            self._actor(actor),
            MaybeListOfOntologyElementMetadata,
        )

    async def update_property_type(
        self,
        request: UpdatePropertyTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Update a property type."""
        endpoint = self.base / "property-types"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            self._actor(actor),
            OntologyElementMetadata,
        )

    async def query_data_types(
        self,
        query: DataTypeStructuralQuery,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query the HASH API for data types."""
        endpoint = self.base / "data-types" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            self._actor(actor),
            Subgraph,
        )

    async def load_external_data_type(
        self,
        request: LoadExternalDataTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Load an external data type."""
        endpoint = self.base / "data-types" / "load"

        return await _send_request(
            endpoint,
            "POST",
            request,
            self._actor(actor),
            OntologyElementMetadata,
        )

    async def create_data_types(
        self,
        request: CreateDataTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> MaybeListOfOntologyElementMetadata:
        """Create a data type."""
        endpoint = self.base / "data-types"

        return await _send_request(
            endpoint,
            "POST",
            request,
            self._actor(actor),
            MaybeListOfOntologyElementMetadata,
        )

    async def update_data_type(
        self,
        request: UpdateDataTypeRequest,
        *,
        actor: UUID | None = None,
    ) -> OntologyElementMetadata:
        """Update a data type."""
        endpoint = self.base / "data-types"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            self._actor(actor),
            OntologyElementMetadata,
        )

    async def query_entities(
        self,
        query: EntityStructuralQuery,
        *,
        actor: UUID | None = None,
    ) -> Subgraph:
        """Query the HASH API for entities."""
        endpoint = self.base / "entities" / "query"

        return await _send_request(
            endpoint,
            "POST",
            query,
            self._actor(actor),
            Subgraph,
        )

    async def create_entity(
        self,
        request: CreateEntityRequest,
        *,
        actor: UUID | None = None,
    ) -> EntityMetadata:
        """Create an entity."""
        endpoint = self.base / "entities"

        return await _send_request(
            endpoint,
            "POST",
            request,
            self._actor(actor),
            EntityMetadata,
        )

    async def update_entity(
        self,
        request: UpdateEntityRequest,
        *,
        actor: UUID | None = None,
    ) -> EntityMetadata:
        """Update an entity."""
        endpoint = self.base / "entities"

        return await _send_request(
            endpoint,
            "PUT",
            request,
            self._actor(actor),
            EntityMetadata,
        )
