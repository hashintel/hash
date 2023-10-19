"""Activity for inferring entities from a prompt."""

import enum
import json
import os
import traceback
from copy import deepcopy
from typing import Any, Literal

import openai
from pydantic import BaseModel, Field
from slugify import slugify
from temporalio import activity

from worker._status import Status, StatusCode
from worker._util import delete_key, flatten_all_of, traverse_dict

from . import (
    EntityValidation,
    InferEntitiesActivityParameter,
    LinkData,
    ProposedEntity,
)

__all__ = [
    "infer_entities",
]


class FunctionParameters(BaseModel, extra="forbid"):
    ty: Literal["object"] = Field("object", alias="type")
    properties: dict[str, Any]
    required: list[str] | None = None


class Function(BaseModel, extra="forbid"):
    name: str
    description: str | None = None
    parameters: FunctionParameters

    @classmethod
    def could_not_infer_entities(cls) -> "Function":
        return Function(
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
        )

    @classmethod
    def openai(
        cls,
        entity_type: dict[str, Any],
        *,
        is_link_type: bool,
    ) -> "Function":
        import jsonref  # type: ignore  # noqa: PGH003

        entity_type = jsonref.replace_refs(entity_type, proxies=False)

        def generate_description(key: str, obj: dict[str, Any]) -> None:
            if key == "description" and "kind" in obj:
                match obj["kind"]:
                    case "propertyType":
                        obj["description"] = f"The {obj['title']} of the entity"
                    case "entityType":
                        obj["description"] = f"A {obj['title']}"

        traverse_dict(
            entity_type,
            lambda key, value: key == "description" and value is None,
            generate_description,
        )

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

        if is_link_type:
            entity_type["properties"]["sourceEntityId"] = {
                "type": "integer",
                "description": "The id of the source entity",
            }
            entity_type["properties"]["targetEntityId"] = {
                "type": "integer",
                "description": "The id of the target entity",
            }
            entity_type["required"] = (
                *[*entity_type.get("required", []), "sourceEntityId", "targetEntityId"],
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
                            "required": entity_type.get("required", []),
                        },
                    },
                },
            ),
        )


class InferenceState(str, enum.Enum):
    entities = "entities"
    last_entity = "last_entity"
    links = "links"
    last_link = "last_link"
    done = "done"


def add_system_prompt(messages: list[dict[str, Any]], state: InferenceState) -> None:
    match state:
        case InferenceState.entities:
            # The current entity type is not the last one. Create more entities.
            messages.append(
                {
                    "role": "system",
                    "content": "Great! Let's create more entities of a different type.",
                },
            )
        case InferenceState.last_entity:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "Great! You have created all entities. You can now"
                        " create links between entities."
                    ),
                },
            )
        case InferenceState.links:
            messages.append(
                {
                    "role": "system",
                    "content": "Great! Let's create more links of a different type.",
                },
            )
        case InferenceState.last_link | InferenceState.done:
            pass


@activity.defn(name="inferEntities")
async def infer_entities(  # noqa: PLR0911, PLR0912, PLR0915, C901
    params: InferEntitiesActivityParameter,
) -> Status[ProposedEntity]:
    """Completes a prompt using the OpenAI API."""
    openai.api_key = os.environ.get("OPENAI_API_KEY")

    if len(params.entity_types) == 0:
        return Status(
            code=StatusCode.INVALID_ARGUMENT,
            message="At least one entity type must be provided.",
        )

    system_prompt = """
    The user provides a text input. This text input is used to infer entities.
    You create the entities by calling the provided function.
    The provided user text is your only source of information, so make sure to extract
    as much information as possible. Empty properties should be left out.
    """

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt.strip()},
        {"role": "user", "content": params.text_input.strip()},
    ]
    entities: list[ProposedEntity] = []
    entity_type_map: dict[str, str] = {}
    try:
        for i, entity_type in enumerate([*params.entity_types, *params.link_types]):
            if i < len(params.entity_types) - 1:
                current_state = InferenceState.entities
            elif i == len(params.entity_types) - 1:
                current_state = InferenceState.last_entity
            elif i < len(params.entity_types) + len(params.link_types) - 1:
                current_state = InferenceState.links
            elif i == len(params.entity_types) + len(params.link_types) - 1:
                current_state = InferenceState.last_link
            else:
                current_state = InferenceState.done

            Function.openai(
                entity_type,
                is_link_type=current_state
                in [
                    InferenceState.links,
                    InferenceState.last_link,
                ],
            ).model_dump(
                by_alias=True,
                exclude_none=True,
            )

            function = Function.openai(
                entity_type,
                is_link_type=current_state
                in [
                    InferenceState.links,
                    InferenceState.last_link,
                ],
            )
            entity_type_map[function.name] = entity_type["$id"]
            completion = await openai.ChatCompletion.acreate(
                model=params.model,
                temperature=params.temperature,
                max_tokens=params.max_tokens,
                messages=messages,
                functions=[
                    function.model_dump(
                        by_alias=True,
                        exclude_none=True,
                    ),
                    Function.could_not_infer_entities().model_dump(
                        by_alias=True,
                        exclude_none=True,
                    ),
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
                        code=StatusCode.RESOURCE_EXHAUSTED,
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

            messages.append(
                {
                    "role": "assistant",
                    "content": None,
                    "function_call": completion["choices"][0]["message"][
                        "function_call"
                    ],
                },
            )

            match current_state:
                case InferenceState.last_entity:
                    # To avoid confusing the AI we don't store the IDs of the entities
                    # until all entities have been inferred. To create links the AI
                    # needs to know the IDs of the entities. We therefore update the
                    # entities.
                    for message in messages:
                        if (
                            message["role"] == "assistant"
                            and "function_call" in message
                        ):
                            function_call = message["function_call"]
                            arguments = json.loads(function_call["arguments"])

                            for entity in arguments["entities"]:
                                if not isinstance(entity, dict):
                                    if params.validation != EntityValidation.none:
                                        return Status(
                                            code=StatusCode.UNKNOWN,
                                            message=(
                                                "The inferred entity is not a"
                                                " dictionary."
                                            ),
                                        )
                                    continue

                                entity_id = len(entities)
                                function_name: str = function_call["name"]
                                entities.append(
                                    ProposedEntity(
                                        entityTypeId=entity_type_map[function_name],
                                        entityId=entity_id,
                                        properties=deepcopy(entity),
                                    ),
                                )
                                entity["entityId"] = entity_id

                            message["function_call"]["arguments"] = json.dumps(
                                arguments,
                            )
                case InferenceState.links | InferenceState.last_link:
                    # We need to extract the source/target IDs as they are not part of
                    # the entity properties.
                    arguments = json.loads(
                        completion["choices"][0]["message"]["function_call"][
                            "arguments"
                        ],
                    )
                    for properties in arguments["entities"]:
                        if "sourceEntityId" in properties:
                            source_entity_id = properties["sourceEntityId"]
                            del properties["sourceEntityId"]
                        else:
                            source_entity_id = None

                        if "targetEntityId" in properties:
                            target_entity_id = properties["targetEntityId"]
                            del properties["targetEntityId"]
                        else:
                            target_entity_id = None

                        if (
                            source_entity_id is not None
                            and target_entity_id is not None
                        ):
                            link_data = LinkData(
                                leftEntityId=source_entity_id,
                                rightEntityId=target_entity_id,
                            )
                        else:
                            link_data = None

                        entities.append(
                            ProposedEntity(
                                entityTypeId=entity_type["$id"],
                                entityId=len(entities),
                                properties=properties,
                                linkData=link_data,
                            ),
                        )

            add_system_prompt(messages, current_state)

    except Exception as error:  # noqa: BLE001
        traceback.print_exc()
        return Status(
            code=StatusCode.UNKNOWN,
            message=f"Unable to infer entities: {error} ({type(error).__name__})",
        )

    return Status(
        code=StatusCode.OK,
        message="success",
        contents=entities,
    )
