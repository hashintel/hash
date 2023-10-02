"""Activity for inferring entities from a prompt."""
import json
import os
from typing import Any, Literal

import openai
from pydantic import BaseModel, Extra, Field
from slugify import slugify
from temporalio import activity

from app._status import Status, StatusCode
from app._util import delete_key, flatten_all_of, traverse_dict

from . import (
    InferEntitiesActivityParameter,
    ProposedEntity,
)

__all__ = [
    "infer_entities",
]


class FunctionParameters(BaseModel, extra=Extra.forbid):
    ty: Literal["object"] = Field("object", alias="type")
    properties: dict[str, Any]
    required: list[str] | None = None


class Function(BaseModel, extra=Extra.forbid):
    name: str
    description: str | None = None
    parameters: FunctionParameters


def create_openai_function(entity_type: dict[str, Any]) -> Function:
    import jsonref  # type: ignore  # noqa: PGH003

    entity_type = jsonref.replace_refs(entity_type, proxies=False)

    traverse_dict(
        entity_type,
        lambda key, _: key.startswith("$") or key == "kind",
        delete_key,
    )
    traverse_dict(
        entity_type,
        lambda key, value: key == "allOf" and len(value) == 1,
        flatten_all_of,
    )
    return Function(
        name=slugify(entity_type["title"]),
        description=entity_type.get("description"),
        parameters=FunctionParameters(
            properties={
                "entities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": entity_type.get("properties", {}),
                        "required": entity_type.get("required"),
                    },
                },
            },
        ),
    )


@activity.defn(name="inferEntities")
async def infer_entities(  # noqa: PLR0911
    params: InferEntitiesActivityParameter,
) -> Status[ProposedEntity]:
    """Completes a prompt using the OpenAI API."""
    openai.api_key = os.environ.get("OPENAI_API_KEY")

    if len(params.entity_types) == 0:
        return Status(
            code=StatusCode.INVALID_ARGUMENT,
            message="At least one entity type must be provided.",
        )

    if len(params.entity_types[0].get("allOf", [])) > 1:
        return Status(
            code=StatusCode.UNIMPLEMENTED,
            message=(
                "Entity type inheritance is not supported, yet. This also includes link"
                " types"
            ),
        )

    system_prompt = """
    The user provides a text input. This text input is used to infer entities.
    You create the entities by calling the provided function.
    Extract as many entities from the user-provided text as possible.
    Empty properties should be left out.
    """

    messages: list[dict[str, Any]] = []
    entities: list[ProposedEntity] = []
    try:
        for entity_type in params.entity_types:
            completion = await openai.ChatCompletion.acreate(
                model=params.model,
                temperature=0.1,
                max_tokens=params.max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": params.text_input},
                    *messages,
                ],
                functions=[
                    create_openai_function(entity_type).model_dump(
                        by_alias=True,
                        exclude_none=True,
                    ),
                    Function(
                        name="could_not_infer_entities",
                        description=(
                            "Returns a warning to the user why no entities could have"
                            " been inferred from the provided text"
                        ),
                        parameters=FunctionParameters(
                            properties={
                                "reason": {
                                    "type": "string",
                                    "description": (
                                        "Detailed reason why no entities could be"
                                        " inferred and how to fix it"
                                    ),
                                },
                            },
                        ),
                    ).model_dump(by_alias=True, exclude_none=True),
                ],
            )

            match completion["choices"][0]["finish_reason"]:
                case "stop":
                    return Status(
                        code=StatusCode.UNKNOWN,
                        message=completion["choices"][0]["message"]["content"],
                    )
                case "length":
                    return Status(
                        code=StatusCode.INVALID_ARGUMENT,
                        message="The maximum amount of tokens was reached.",
                    )
                case "content_filter":
                    return Status(
                        code=StatusCode.INVALID_ARGUMENT,
                        message="The content filter was triggered.",
                    )
                case "function_call":
                    name = completion["choices"][0]["message"]["function_call"]["name"]
                    arguments = json.loads(
                        completion["choices"][0]["message"]["function_call"][
                            "arguments"
                        ],
                    )
                    if name == "could_not_infer_entities":
                        if params.allow_empty_results:
                            continue
                        return Status(
                            code=StatusCode.INVALID_ARGUMENT,
                            message=(
                                f"No entities of type `{entity_type['$id']}` could have"
                                " been inferred from the provided text:"
                                f" {arguments['reason']}"
                            ),
                        )

            inferred_entities = json.loads(
                completion["choices"][0]["message"]["function_call"]["arguments"],
            )
            entities += [
                ProposedEntity(entityTypeId=entity_type["$id"], properties=properties)
                for properties in inferred_entities["entities"]
            ]

            messages.append(
                {
                    "role": "assistant",
                    "content": None,
                    "function_call": {
                        "name": completion["choices"][0]["message"]["function_call"][
                            "name"
                        ],
                        "arguments": json.dumps(inferred_entities),
                    },
                },
            )
            messages.append(
                {
                    "role": "system",
                    "content": "Great! Let's create more entities of a different type.",
                },
            )

    except Exception as error:  # noqa: BLE001
        return Status(
            code=StatusCode.UNKNOWN,
            message=f"Unable to infer entities: {error}",
        )

    return Status(
        code=StatusCode.OK,
        message="success",
        contents=entities,
    )
