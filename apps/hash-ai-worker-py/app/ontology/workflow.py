"""Workflow definitions to interact with the Graph.."""

from datetime import timedelta
from typing import Any

from temporalio import workflow

from . import GetClosedEntityTypeWorkflowParameter

with workflow.unsafe.imports_passed_through():
    from graph_types import (
        EntityTypeReference,
    )

    # WARNING: this has to be passed through `workflow.unsafe.imports_passed_through()`,
    #          otherwise error handling will not work!
    from app._status import Status, StatusCode, StatusError

    from .activity import GraphApiActivities


@workflow.defn(name="getClosedEntityType")
class GetClosedEntityTypeWorkflow:
    """Infers entities of the specified type(s) from the provided text input."""

    @workflow.run
    async def get_closed_entity_type(
        self,
        params: GetClosedEntityTypeWorkflowParameter,
    ) -> Status[dict[str, Any]]:
        """Infer entities from the provided text input."""
        try:
            model = await EntityTypeReference(
                **{"$ref": params.entity_type_id},
            ).create_model(
                actor_id=params.authentication.actor_id,
                graph=GraphApiActivities(start_to_close_timeout=timedelta(seconds=15)),
            )
        except StatusError as error:
            return error.status

        return Status(
            code=StatusCode.OK,
            message="success",
            contents=[model.model_json_schema(by_alias=True)],
        )
