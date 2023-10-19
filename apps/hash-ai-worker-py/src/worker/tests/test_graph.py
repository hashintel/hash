"""Test unit."""

#  ruff: noqa: S101

from datetime import timedelta
from uuid import UUID

import pytest
from graph_types import (
    DataTypeReference,
    DataTypeSchema,
    EntityTypeSchema,
    PropertyTypeSchema,
)
from graph_types.property_type import PropertyValue

from worker.ontology.activity import GraphApiActivities

from .mocks.activity import mock_activities  # noqa: F401

__all__: list[str] = []


async def get_data_type(data_type_id: str, *, include_required: bool) -> DataTypeSchema:
    return await GraphApiActivities(
        start_to_close_timeout=timedelta(seconds=5),
        validate_required=include_required,
    ).get_data_type(data_type_id, actor_id=UUID("00000000-0000-0000-0000-000000000000"))


async def get_property_type(
    property_type_id: str,
    *,
    include_required: bool,
) -> PropertyTypeSchema:
    return await GraphApiActivities(
        start_to_close_timeout=timedelta(seconds=5),
        validate_required=include_required,
    ).get_property_type(
        property_type_id,
        actor_id=UUID("00000000-0000-0000-0000-000000000000"),
    )


async def get_entity_type(
    entity_type_id: str,
    *,
    include_required: bool,
) -> EntityTypeSchema:
    return await GraphApiActivities(
        start_to_close_timeout=timedelta(seconds=5),
        validate_required=include_required,
    ).get_entity_type(
        entity_type_id,
        actor_id=UUID("00000000-0000-0000-0000-000000000000"),
    )


@pytest.mark.usefixtures("mock_activities")
@pytest.mark.vcr()
@pytest.mark.parametrize(
    ("data_type_id", "expected_title", "expected_type"),
    [
        (
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            "Text",
            "string",
        ),
        (
            "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            "Number",
            "number",
        ),
    ],
)
async def test_data_types(
    data_type_id: str,
    expected_title: str,
    expected_type: str,
) -> None:
    """Test reading data types via the GraphApiActivities."""
    for required in [True, False]:
        data_type = await get_data_type(
            data_type_id,
            include_required=required,
        )
        assert data_type.title == expected_title
        assert data_type.ty == expected_type


@pytest.mark.usefixtures("mock_activities")
@pytest.mark.vcr()
@pytest.mark.parametrize(
    ("property_type_id", "expected_title", "expected_data_types"),
    [
        (
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1",
            "Name",
            ["https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        ),
        (
            "https://blockprotocol.org/@examples/types/property-type/e-mail/v/1",
            "E-Mail",
            ["https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        ),
    ],
)
async def test_property_types(
    property_type_id: str,
    expected_title: str,
    expected_data_types: list[str],
) -> None:
    """Test reading property types via the GraphApiActivities."""
    for required in [True, False]:
        property_type = await get_property_type(
            property_type_id,
            include_required=required,
        )
        assert property_type.title == expected_title
        for expected_data_type in expected_data_types:
            assert (
                PropertyValue(root=(DataTypeReference(**{"$ref": expected_data_type})))
                in property_type.one_of
            )
        assert len(property_type.one_of) == len(expected_data_types)


@pytest.mark.usefixtures("mock_activities")
@pytest.mark.vcr()
@pytest.mark.parametrize(
    (
        "entity_type_id",
        "expected_title",
        "expected_property_types",
        "required_property_types",
    ),
    [
        (
            "https://blockprotocol.org/@examples/types/entity-type/person/v/1",
            "Person",
            [
                "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
                "https://blockprotocol.org/@examples/types/property-type/e-mail/",
            ],
            [
                "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
            ],
        ),
        (
            "https://blockprotocol.org/@examples/types/entity-type/company/v/1",
            "Company",
            [
                "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
            ],
            [
                "https://blockprotocol.org/@blockprotocol/types/property-type/name/",
            ],
        ),
        (
            "https://blockprotocol.org/@examples/types/entity-type/founded-by/v/1",
            "Founded By",
            [],
            [],
        ),
        (
            "https://blockprotocol.org/@examples/types/entity-type/employed-by/v/1",
            "Employed By",
            [],
            [],
        ),
    ],
)
async def test_entity_types(
    entity_type_id: str,
    expected_title: str,
    expected_property_types: list[str],
    required_property_types: list[str],
) -> None:
    """Test reading property types via the GraphApiActivities."""
    for required in [True, False]:
        entity_type = await get_entity_type(
            entity_type_id,
            include_required=required,
        )
        assert entity_type.title == expected_title
        for expected_property_type in expected_property_types:
            assert expected_property_type in entity_type.properties
        assert len(entity_type.properties) == len(expected_property_types)

        if required:
            assert entity_type.required is not None
            for required_property_type in required_property_types:
                assert required_property_type in entity_type.required
            assert len(entity_type.required) == len(required_property_types)
        else:
            assert entity_type.required is None
