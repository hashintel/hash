"""Test unit."""

#  ruff: noqa: S101, E501


import json
import os
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from pydantic_core import ErrorDetails

from worker import AuthenticationContext
from worker._status import Status, StatusCode
from worker.infer.entities import (
    EntityValidation,
    InferEntitiesWorkflowParameter,
    InferEntitiesWorkflowResult,
)
from worker.infer.entities.workflow import InferEntitiesWorkflow

from .mocks.activity import mock_activities  # noqa: F401
from .mocks.openai import set_openai_key  # noqa: F401

__all__: list[str] = []


@pytest.fixture(scope="module")
def vcr_config() -> dict[str, Any]:
    return {
        "filter_headers": [("authorization", "<REDACTED>")],
    }


async def infer_entities(
    *,
    input_file: str,
    entity_type_ids: list[str],
    allow_empty: bool,
    validation: EntityValidation,
) -> Status[InferEntitiesWorkflowResult | ErrorDetails]:
    with Path.open(
        os.path.realpath(Path.cwd() / Path(__file__).parent)
        / Path("texts")
        / input_file,
    ) as file:
        text_input = file.read()

    return await InferEntitiesWorkflow().infer_entities(
        InferEntitiesWorkflowParameter(
            authentication=AuthenticationContext(
                actorId=UUID("00000000-0000-0000-0000-000000000000"),
            ),
            textInput=text_input,
            entityTypeIds=entity_type_ids,
            model="gpt-4-0613",
            maxTokens=None,
            allowEmptyResults=allow_empty,
            validation=validation,
            temperature=0.0,
        ),
    )


@pytest.mark.usefixtures("mock_activities", "set_openai_key")
@pytest.mark.vcr(
    match_on=["method", "scheme", "host", "port", "path", "body", "query"],
)
@pytest.mark.parametrize(
    (
        "input_file",
        "entity_type_ids",
        "allow_empty",
        "validation",
        "expected_entities",
        "expected_links",
    ),
    [
        (
            "microsoft.txt",
            [
                "https://blockprotocol.org/@examples/types/entity-type/company/v/1",
                "https://blockprotocol.org/@examples/types/entity-type/person/v/1",
                "https://blockprotocol.org/@examples/types/entity-type/employed-by/v/1",
                "https://blockprotocol.org/@examples/types/entity-type/founded-by/v/1",
            ],
            False,
            EntityValidation.full,
            [
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/person/v/1",
                    "properties": {
                        "https://blockprotocol.org/@blockprotocol/types/property-type/name/": (
                            "Bill Gates"
                        ),
                    },
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/person/v/1",
                    "properties": {
                        "https://blockprotocol.org/@blockprotocol/types/property-type/name/": (
                            "Paul Allen"
                        ),
                    },
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/person/v/1",
                    "properties": {
                        "https://blockprotocol.org/@blockprotocol/types/property-type/name/": (
                            "Satya Nadella"
                        ),
                    },
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/person/v/1",
                    "properties": {
                        "https://blockprotocol.org/@blockprotocol/types/property-type/name/": (
                            "Steve Ballmer"
                        ),
                    },
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/company/v/1",
                    "properties": {
                        "https://blockprotocol.org/@blockprotocol/types/property-type/name/": (
                            "Microsoft Corporation"
                        ),
                    },
                },
            ],
            [
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/founded-by/v/1",
                    "source": 4,
                    "target": 0,
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/founded-by/v/1",
                    "source": 4,
                    "target": 1,
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/employed-by/v/1",
                    "source": 0,
                    "target": 4,
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/employed-by/v/1",
                    "source": 1,
                    "target": 4,
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/employed-by/v/1",
                    "source": 2,
                    "target": 4,
                },
                {
                    "entityTypeId": "https://blockprotocol.org/@examples/types/entity-type/employed-by/v/1",
                    "source": 3,
                    "target": 4,
                },
            ],
        ),
    ],
)
async def test_entity_inference(  # noqa: PLR0913
    *,
    input_file: str,
    entity_type_ids: list[str],
    allow_empty: bool,
    validation: EntityValidation,
    expected_entities: list[dict[str, Any]],
    expected_links: list[dict[str, Any]],
) -> None:
    """Tests entities inference workflow."""
    status = await infer_entities(
        input_file=input_file,
        entity_type_ids=entity_type_ids,
        allow_empty=allow_empty,
        validation=validation,
    )

    assert status.code == StatusCode.OK, status.message
    content = status.into_content()
    assert isinstance(content, InferEntitiesWorkflowResult)
    entities = content.entities

    for expected_entity in expected_entities:
        found_entity = None
        for entity in entities:
            if (
                entity.entity_type_id == expected_entity["entityTypeId"]
                and entity.properties.items() >= expected_entity["properties"].items()
            ):
                found_entity = entity
                break

        assert (
            found_entity is not None
        ), f"Expected entity not found: {json.dumps(expected_entity, indent=2)}"
        expected_entity["entityId"] = found_entity.entity_id

    for expected_link in expected_links:
        found_link = None
        for entity in entities:
            if (
                entity.entity_type_id == expected_link["entityTypeId"]
                and entity.link_data is not None
                and entity.link_data.left_entity_id
                == expected_entities[expected_link["source"]]["entityId"]
                and entity.link_data.right_entity_id
                == expected_entities[expected_link["target"]]["entityId"]
            ):
                found_link = entity
                break

        assert (
            found_link is not None
        ), f"Expected link not found: {json.dumps(expected_link, indent=2)}"
