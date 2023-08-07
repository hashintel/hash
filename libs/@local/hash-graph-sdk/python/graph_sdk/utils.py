import asyncio
from collections.abc import Awaitable
from typing import TYPE_CHECKING, TypeVar

if TYPE_CHECKING:
    from types import EllipsisType

T = TypeVar("T")

Missing = ...


def async_to_sync(awaitable: Awaitable[T]) -> T:
    """Run an awaitable and return the result.

    Different from `asyncio.run` in that it does not create a new event loop each time.
    """
    response: T | "EllipsisType" = Missing

    async def run_and_capture() -> None:
        nonlocal response
        response = await awaitable

    loop = asyncio.get_event_loop()
    coroutine = run_and_capture()
    loop.run_until_complete(coroutine)

    if response is Missing:
        msg = "response was not set"
        raise ValueError(msg)

    return response


__all__ = ["async_to_sync"]
