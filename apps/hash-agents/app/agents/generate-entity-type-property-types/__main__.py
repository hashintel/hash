import json

from langchain.chat_models import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

from .io_types import *

SYSTEM_MESSAGE_CONTENT = ' '.join([
    "You are an entity type generator.",
    "Given a title and description of an entity type, generate relevant property types for the entity.",
    "Respond to any user prompts in a minified JSON array format (no whitespace),",
    "where each item in the array represents a property type for the entity type",
    "where each property type has a `title`, `description`,",
    # TODO - support additional data types
    "and a `dataType` (one of `text`, `number` or `boolean`)."
])

def main(agent_input: Input) -> Output:
    # TODO - add support for querying existing property types so that they can be re-used
    chat = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)

    messages = [
        SystemMessage(content=SYSTEM_MESSAGE_CONTENT),
        HumanMessage(content=json.dumps({
            "title": agent_input.entity_type_title,
            "description": agent_input.entity_type_description
        }))
    ]

    response = chat(messages)

    property_type_definitions = json.loads(response.content)

    getLogger().info(f"property_type_definitions: {property_type_definitions}")

    # TODO - validate the response

    for property_type in property_type_definitions:
        print(property_type)

    return Output([PropertyTypeDefinition.from_dict(property_type) for property_type in property_type_definitions])


if __name__ == "HASH":
    global IN, OUT
    OUT = main(IN)

if __name__ == "__main__":
    from logging import getLogger

    from ... import setup

    setup()

    output = main(Input(entity_type_description="A station that is in space.", entity_type_title="Space Station"))

    getLogger().info(f"output: {output}")
