"""Workflows to read ontology types."""

from pydantic import BaseModel, Extra, Field

from worker import AuthenticationContext


class GetClosedEntityTypeWorkflowParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    authentication: AuthenticationContext
    entity_type_id: str = Field(..., alias="entityTypeId")
