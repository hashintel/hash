"""Workflows to read ontology types."""

from pydantic import BaseModel, Field

from worker import AuthenticationContext


class GetClosedEntityTypeWorkflowParameter(BaseModel, extra="forbid"):
    """Parameters for entity inference workflow."""

    authentication: AuthenticationContext
    entity_type_id: str = Field(..., alias="entityTypeId")
