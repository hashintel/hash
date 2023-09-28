"""Temporal activities available to workflows."""

from temporalio import activity

from app._status import Status, StatusCode

from . import (
    InferEntitiesActivityParameter,
    ProposedEntity,
)


@activity.defn(name="inferEntities")
async def infer_entities(
    params: InferEntitiesActivityParameter,
) -> Status[ProposedEntity]:
    """Completes a prompt using the OpenAI API."""
    print(params.model_dump_json(by_alias=True, indent=2))
    return Status(
        code=StatusCode.UNIMPLEMENTED,
        message="Entity inference is not yet implemented.",
    )
