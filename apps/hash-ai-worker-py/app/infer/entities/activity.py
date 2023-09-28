"""Activity for inferring entities from a prompt."""
import os

import openai
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
    params: InferEntitiesActivityParameter,
) -> Status[ProposedEntity]:
    """Completes a prompt using the OpenAI API."""
    openai.api_key = os.environ.get("OPENAI_API_KEY")

    # completion = await openai.ChatCompletion.acreate(
    #     model="gpt-3.5-turbo-0613",
    #     temperature=0,
    #     max_tokens=512,
    #     messages=[
    #         {"role": "system", "content": "You are a helpful assistant."},
    #         {"role": "user", "content": params.text_input},
    #     ],
    # )
    # print(completion)

    return Status(
        code=StatusCode.OK,
        message="success",
        contents=[
            ProposedEntity(
                entityTypeId=entity_type["$id"],
                properties={
                    "entityId": "test",
                    "entityType": "test",
                },
            )
            for entity_type in params.entity_types
        ],
    )
