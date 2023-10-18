"""Entity inference based on text."""

import enum
from typing import Any

from pydantic import BaseModel, Field
from temporalio import workflow

from worker import AuthenticationContext

with workflow.unsafe.imports_passed_through():
    from graph_types.base import EntityType


class EntityValidation(str, enum.Enum):
    """The validation status of an entity."""

    full = "FULL"
    """The inferred entities are fully validated."""
    partial = "PARTIAL"
    """Full validation except the `required` field."""
    none = "NONE"
    """No validation performed."""


# Keep this in sync with the ProposedLinkData type in the GraphQL definition
class LinkData(BaseModel, extra="forbid"):
    """Link data for an entity."""

    left_entity_id: int = Field(..., alias="leftEntityId")
    right_entity_id: int = Field(..., alias="rightEntityId")


# Keep this in sync with the ProposedEntity type in the GraphQL definition
class ProposedEntity(BaseModel, extra="forbid"):
    """An entity proposed by AI."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    entity_id: int = Field(..., alias="entityId")
    properties: Any
    link_data: LinkData | None = Field(None, alias="linkData")

    def validate_entity_type(self, entity_type: type[EntityType]) -> None:
        """Validates the proposed entity against the given entity type."""
        entity_type(**self.properties)


# Keep this in sync with the inferEntities mutation in the GraphQL definition
class InferEntitiesWorkflowParameter(BaseModel, extra="forbid"):
    """Parameters for entity inference workflow."""

    authentication: AuthenticationContext
    text_input: str = Field(..., alias="textInput")
    entity_type_ids: list[str] = Field(..., alias="entityTypeIds")
    model: str
    max_tokens: int | None = Field(..., alias="maxTokens")
    allow_empty_results: bool = Field(..., alias="allowEmptyResults")
    validation: EntityValidation
    temperature: float


# Keep this in sync with the InferEntitiesResult type in the GraphQL definition
class InferEntitiesWorkflowResult(BaseModel, extra="forbid"):
    """Result of entity inference workflow."""

    entities: list[ProposedEntity]


class InferEntitiesActivityParameter(BaseModel, extra="forbid"):
    """Parameters for entity inference workflow."""

    text_input: str = Field(..., alias="textInput")
    entity_types: list[dict[str, Any]] = Field(..., alias="entityTypes")
    link_types: list[dict[str, Any]] = Field(..., alias="linkTypes")
    model: str
    max_tokens: int | None = Field(..., alias="maxTokens")
    allow_empty_results: bool = Field(..., alias="allowEmptyResults")
    validation: EntityValidation
    temperature: float
