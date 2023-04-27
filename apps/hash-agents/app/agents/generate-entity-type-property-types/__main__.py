import json

import structlog.stdlib
from langchain.chat_models import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

from .io_types import Input, Output, PropertyTypeDefinition

logger = structlog.stdlib.get_logger(__name__)

SYSTEM_MESSAGE_CONTENT = (
    "You are an entity type generator. Given a title and description of an entity"
    " type, generate relevant property types for the entity. Respond to any user"
    " prompts in a minified JSON array format (no whitespace), where each item in the"
    " array represents a property type for the entity type where each property type has"
    " a `title`, `description`, and a `dataType` (one of `text`, `number` or"
    " `boolean`)."
)


def main(agent_input: Input) -> Output:
    # TODO - add support for querying existing property types so
    # that they can be re-used
    chat = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)

    messages = [
        SystemMessage(content=SYSTEM_MESSAGE_CONTENT),
        HumanMessage(
            content=json.dumps(
                {
                    "title": agent_input.entity_type_title,
                    "description": agent_input.entity_type_description,
                }
            )
        ),
    ]

    response = chat(messages)

    try:
        property_type_definitions = json.loads(response.content)
    except json.JSONDecodeError as e:
        # TODO - handle the JSON decoding error using some form of retry logic
        raise json.JsonParsingError("Failed to parse OpenAI JSON data") from e

    # TODO - validate the structure of the generated JSON data, and handle
    # any errors using some form of retry logic

    logger.info(property_type_definitions=property_type_definitions)

    return Output(
        [
            PropertyTypeDefinition.from_dict(property_type)
            for property_type in property_type_definitions
        ]
    )


if __name__ == "HASH":
    global IN, OUT
    OUT = main(IN)  # noqa: F821

if __name__ == "__main__":
    from ... import setup

    setup("dev")

    output = main(
        Input(
            entity_type_description="A station that is in space.",
            entity_type_title="Space Station",
        )
    )

    logger.info(output=output)
