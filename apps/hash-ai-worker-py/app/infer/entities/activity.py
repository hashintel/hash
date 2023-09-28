"""Activity for inferring entities from a prompt."""

from temporalio import activity

from app._status import Status, StatusCode

from . import (
    InferEntitiesActivityParameter,
    ProposedEntity,
)

__all__ = [
    "infer_entities",
]


@activity.defn(name="inferEntities")
async def infer_entities(
    _params: InferEntitiesActivityParameter,
) -> Status[ProposedEntity]:
    """Completes a prompt using the OpenAI API."""
    status: Status[ProposedEntity] = Status(
        code=StatusCode.UNIMPLEMENTED,
        message="Entity inference is not yet implemented.",
        contents=[],
    )
    return status
