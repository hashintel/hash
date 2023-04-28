import json

import structlog.stdlib
from langchain.chat_models import ChatOpenAI
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.schema import HumanMessage, SystemMessage
from qdrant_client import QdrantClient
from qdrant_client.http import models

from .io_types import Input, Output, PropertyTypeDefinition

logger = structlog.stdlib.get_logger(__name__)


def are_property_types_semantically_the_same(property_type_1, property_type_2):
    chat = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)

    messages = [
        SystemMessage(
            content=(
                "You are an ontology tool used to determine whether the semantic"
                " meaning of two property types is the same. The title or descriptions"
                " may not identical but they can convey the same semantic meaning. The"
                " input will be an array of two property types with a `title` and"
                " `description`, and you must respond to any user prompts in a minified"
                " JSON format (no whitespace), with a `result` boolean field indicating"
                " whether the property types are semantically the same, and a `reason`"
                " string field giving an explanation."
            )
        ),
        HumanMessage(
            content=json.dumps(
                [
                    {
                        "title": property_type_1["title"],
                        "description": property_type_1["description"],
                    },
                    {
                        "title": property_type_2["title"],
                        "description": property_type_2["description"],
                    },
                ]
            )
        ),
    ]

    response = chat(messages)

    try:
        response_content = json.loads(response.content)
    except json.JSONDecodeError as e:
        # TODO - handle the JSON decoding error using some form of retry logic
        raise json.JsonParsingError("Failed to parse OpenAI JSON data") from e

    # TODO - validate the structure of the generated JSON data, and handle
    # any errors using some form of retry logic

    result = response_content["result"]

    return result


def generate_property_types(entity_type_title, entity_type_description):
    chat = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)

    messages = [
        SystemMessage(
            content=(
                "You are an entity type generator. Given a title and description of an"
                " entity type, generate relevant property types for the entity. Respond"
                " to any user prompts in a minified JSON array format (no whitespace),"
                " where each item in the array represents a property type for the"
                " entity type where each property type has a `title`, `description`,"
                " and a `dataType` (one of `text`, `number` or `boolean`)."
            )
        ),
        HumanMessage(
            content=json.dumps(
                {
                    "title": entity_type_title,
                    "description": entity_type_description,
                }
            )
        ),
    ]

    response = chat(messages)

    try:
        generated_property_type_definitions = json.loads(response.content)
    except json.JSONDecodeError as e:
        # TODO - handle the JSON decoding error using some form of retry logic
        raise json.JsonParsingError("Failed to parse OpenAI JSON data") from e

    # TODO - validate the structure of the generated JSON data, and handle
    # any errors using some form of retry logic

    return generated_property_type_definitions


def main(agent_input: Input, qdrant_host: str) -> Output:
    # TODO - add support for querying existing property types so
    # that they can be re-used

    qdrant_client = QdrantClient(host=qdrant_host, port=6333)

    embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")

    generated_property_type_definitions = generate_property_types(
        agent_input.entity_type_title, agent_input.entity_type_description
    )

    property_type_definitions = []

    # TODO - process these simultaneously
    for generated_property_type_definition in generated_property_type_definitions:
        vector = embeddings.embed_query(json.dumps(generated_property_type_definition))

        search_results = qdrant_client.search(
            collection_name="property_types",
            search_params=models.SearchParams(hnsw_ef=128, exact=False),
            query_vector=vector,
            limit=1,
        )

        closest_matching_property_type = json.loads(
            search_results[0].payload["metadata"]["schema"]
        )

        if are_property_types_semantically_the_same(
            generated_property_type_definition, closest_matching_property_type
        ):
            property_type_definitions.append(closest_matching_property_type)
        else:
            property_type_definitions.append(generated_property_type_definition)

    return Output(
        property_type_definitions=[
            PropertyTypeDefinition.from_dict(property_type)
            for property_type in property_type_definitions
        ]
    )


if __name__ == "HASH":
    global IN, OUT
    OUT = main(IN, "hash-qdrant")  # noqa: F821

if __name__ == "__main__":
    from ... import setup

    setup("dev")

    output = main(
        Input(
            entity_type_description="A station that is in space.",
            entity_type_title="Space Station",
        ),
        "localhost",
    )

    logger.info(output=output)
