"""Entity inference based on text."""
import enum
from typing import Any

from pydantic import BaseModel, Extra, Field
from temporalio import workflow

from app import AuthenticationContext

with workflow.unsafe.imports_passed_through():
    from graph_types.base import EntityType


class EntityValidation(str, enum.Enum):
    """The validation status of an entity."""

    full = "full"
    """The inferred entities are fully validated."""
    partial = "partial"
    """Full validation except the `required` field."""
    none = "none"
    """No validation performed."""


class LinkData(BaseModel, extra=Extra.forbid):
    """Link data for an entity."""

    left_entity_id: int = Field(..., alias="leftEntityId")
    right_entity_id: int = Field(..., alias="rightEntityId")


class ProposedEntity(BaseModel, extra=Extra.forbid):
    """An entity proposed by AI."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    entity_id: int = Field(..., alias="entityId")
    properties: Any
    link_data: LinkData | None = Field(None, alias="linkData")

    def validate_entity_type(self, entity_type: type[EntityType]) -> None:
        """Validates the proposed entity against the given entity type."""
        entity_type(**self.properties)


class InferEntitiesWorkflowParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    authentication: AuthenticationContext
    text_input: str = Field(..., alias="textInput")
    entity_type_ids: list[str] = Field(..., alias="entityTypeIds")
    model: str = "gpt-4-0613"
    max_tokens: int = Field(4096, alias="maxTokens")
    allow_empty_results: bool = Field(True, alias="allowEmptyResults")  # noqa: FBT003
    validation: EntityValidation = Field(EntityValidation.full)
    temperature: float = 0.0


class InferEntitiesActivityParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    text_input: str = Field(..., alias="textInput")
    entity_types: list[dict[str, Any]] = Field(..., alias="entityTypes")
    link_types: list[dict[str, Any]] = Field(..., alias="linkTypes")
    model: str
    max_tokens: int = Field(..., alias="maxTokens")
    allow_empty_results: bool = Field(..., alias="allowEmptyResults")
    validation: EntityValidation
    temperature: float
