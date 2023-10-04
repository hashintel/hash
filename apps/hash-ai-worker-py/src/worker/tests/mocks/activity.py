"""Contains the mocks for invoking temporal activities from a workflow."""

from datetime import timedelta
from typing import Any
from uuid import UUID

import httpx
import pytest
from pytest_mock import MockerFixture

__all__ = ["mock_activities"]

from worker.infer.entities.activity import infer_entities


async def delegate_ai_queue(
    activity: str,
    arg: Any,  # noqa: ANN401
    *,
    start_to_close_timeout: timedelta,
) -> Any:  # noqa: ANN401
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


async def delegate_aipy_queue(
    activity: str,
    arg: Any,  # noqa: ANN401
    *,
    start_to_close_timeout: timedelta,  # noqa: ARG001
) -> Any:  # noqa: ANN401
    match activity:
        case "inferEntities":
            return (await infer_entities(arg)).model_dump(by_alias=True)
        case _:
            msg = f"Unknown activity: `{activity}`"
            raise ValueError(msg)


async def graph_workflow(
    activity: str,
    arg: Any,  # noqa: ANN401
    *,
    task_queue: str = "aipy",
    start_to_close_timeout: timedelta,
) -> Any:  # noqa: ANN401
    match task_queue:
        case "ai":
            return await delegate_ai_queue(
                activity,
                arg,
                start_to_close_timeout=start_to_close_timeout,
            )
        case "aipy":
            return await delegate_aipy_queue(
                activity,
                arg,
                start_to_close_timeout=start_to_close_timeout,
            )
        case _:
            msg = f"Unknown task queue: `{task_queue}`"
            raise ValueError(msg)


@pytest.fixture()
def mock_activities(mocker: MockerFixture) -> None:  # noqa: PT004
    """Fixture to mock the activities."""
    mocker.patch("temporalio.workflow.execute_activity", wraps=graph_workflow)
