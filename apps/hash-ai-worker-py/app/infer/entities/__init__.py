"""Entity inference based on text."""

from typing import Any

from pydantic import BaseModel, Extra, Field
from temporalio import workflow

from app import AuthenticationContext

with workflow.unsafe.imports_passed_through():
    from graph_types.base import EntityType


class ProposedEntity(BaseModel, extra=Extra.forbid):
    """An entity proposed by AI."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    properties: Any

    def validate_entity_type(self, entity_type: type[EntityType]) -> None:
        """Validates the proposed entity against the given entity type."""
        entity_type(**self.properties)


class InferEntitiesWorkflowParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    authentication: AuthenticationContext
    text_input: str = Field(..., alias="textInput")
    entity_type_ids: list[str] = Field(..., alias="entityTypeIds")


class InferEntitiesActivityParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    text_input: str = Field(..., alias="textInput")
    entity_types: list[dict[str, Any]] = Field(..., alias="entityTypes")
