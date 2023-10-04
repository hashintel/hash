"""Contains the mocks for invoking temporal activities from a workflow."""

from datetime import timedelta
from typing import Any
from uuid import UUID

import httpx
import pytest
from pytest_mock import MockerFixture

__all__ = ["mock_graph_workflow"]


async def graph_workflow(
    task_queue: str,
    activity: str,
    arg: Any,  # noqa: ANN401
    start_to_close_timeout: timedelta,
) -> Any:  # noqa: ANN401
    if task_queue != "ai":
        msg = f"Unexpected task queue: {task_queue}"
        raise ValueError(msg)
    if not isinstance(arg, dict):
        msg = f"Unexpected arg type: {type(arg).__name__}"
        raise TypeError(msg)

    match activity:
        case "getDataTypeActivity":
            if "dataTypeId" not in arg:
                msg = "Missing arg: `dataTypeId`"
                raise ValueError(msg)
            url = arg["dataTypeId"]
        case "getPropertyTypeActivity":
            if "propertyTypeId" not in arg:
                msg = "Missing arg: `propertyTypeId`"
                raise ValueError(msg)
            url = arg["propertyTypeId"]
        case "getEntityTypeActivity":
            if "entityTypeId" not in arg:
                msg = "Missing arg: `entityTypeId`"
                raise ValueError(msg)
            url = arg["entityTypeId"]
        case _:
            msg = f"Unknown activity: `{activity}`"
            raise ValueError(msg)

    if "authentication" not in arg:
        msg = "Missing arg: `authentication`"
        raise ValueError(msg)
    if "actorId" not in arg["authentication"]:
        msg = "Missing arg: `authentication.actorId`"
        raise ValueError(msg)
    if not isinstance(arg["authentication"]["actorId"], UUID):
        msg = f"Unexpected `actorId` type: `{type(arg).__name__}`, expected `str`"
        raise TypeError(
            msg,
        )

    async with httpx.AsyncClient(
        timeout=start_to_close_timeout.total_seconds(),
    ) as client:
        response = await client.request("GET", url)
    response.raise_for_status()

    return {
        "code": "OK",
        "message": "Success",
        "contents": [{"schema": response.json()}],
    }


@pytest.fixture()
def mock_graph_workflow(mocker: MockerFixture) -> None:  # noqa: PT004
    """Fixture to mock the graph workflow activity."""
    mocker.patch("temporalio.workflow.execute_activity", wraps=graph_workflow)
