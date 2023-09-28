from typing import Any
from uuid import UUID

from pydantic import BaseModel, Extra, Field
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    pass


class AuthenticationContext(BaseModel, extra=Extra.forbid):
    """Context to hold information to authenticate a user."""

    actor_id: UUID = Field(..., alias="actorId")


class ProposedEntity(BaseModel, extra=Extra.forbid):
    """An entity proposed by AI."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    properties: Any


class InferEntitiesWorkflowParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    authentication: AuthenticationContext
    text_input: str = Field(..., alias="textInput")
    entity_type_ids: list[str] = Field(..., alias="entityTypeIds")


class InferEntitiesActivityParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    text_input: str = Field(..., alias="textInput")
    entity_types: list[dict[str, Any]] = Field(..., alias="entityTypes")
