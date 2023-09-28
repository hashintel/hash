"""Workflow for inferring entities from the provided text input."""

import asyncio
from datetime import timedelta
from typing import Any

from temporalio import workflow

from app import AuthenticationContext
from app.ontology import GetClosedEntityTypeWorkflowParameter

from . import (
    InferEntitiesActivityParameter,
    InferEntitiesWorkflowParameter,
    ProposedEntity,
)

with workflow.unsafe.imports_passed_through():
    from app._status import Status, StatusCode, StatusError

__all__ = [
    "InferEntitiesWorkflow",
]


async def get_closed_entity_type(
    authentication: AuthenticationContext,
    entity_type_id: str,
) -> dict[str, Any]:
    # TODO: Figure out how to pass the workflow function to gain type safety.
    #   https://linear.app/hash/issue/H-875
    # from app.ontology.workflow import GetClosedEntityTypeWorkflow
    status: Status[dict[str, Any]] = Status(
        **await workflow.execute_child_workflow(
            "getClosedEntityType",
            GetClosedEntityTypeWorkflowParameter(
                authentication=authentication,
                entityTypeId=entity_type_id,
            ),
        ),
    )
    return status.into_content()


@workflow.defn(name="inferEntities")
class InferEntitiesWorkflow:
    """Infers entities of the specified type(s) from the provided text input."""

    @workflow.run
    async def infer_entities(
        self,
        params: InferEntitiesWorkflowParameter,
    ) -> Status[ProposedEntity]:
        """Infer entities from the provided text input."""
        if len(params.entity_type_ids) == 0:
            return Status(
                code=StatusCode.INVALID_ARGUMENT,
                message="At least one entity type ID must be provided.",
            )

        try:
            entity_types = await asyncio.gather(
                *[
                    get_closed_entity_type(params.authentication, entity_type_id)
                    for entity_type_id in params.entity_type_ids
                ],
            )
        except StatusError as error:
            return error.status

        # TODO: Figure out how to pass `infer_entities` as function to gain type safety.
        #   https://linear.app/hash/issue/H-875
        # from app.infer.entities.activity import infer_entities
        status: Status[ProposedEntity] = await workflow.execute_activity(
            "inferEntities",
            InferEntitiesActivityParameter(
                textInput=params.text_input,
                entityTypes=entity_types,
            ),
            start_to_close_timeout=timedelta(minutes=1),
        )
        return status
