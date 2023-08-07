"""Blocking API for the Graph SDK.

This is just a thin wrapper around the async API.

(Usually, one could achieve this by simply wrapping the async API automatically,
the problem with that approach however is that users loose the ability to look
at the source code)
"""
import asyncio
from types import EllipsisType
from typing import Self, Awaitable, TypeVar
from uuid import UUID

from yarl import URL
from graph_sdk.concurrent import HASHClient as ConcurrentHASHClient

T = TypeVar("T")

Missing = ...


def async_to_sync(awaitable: Awaitable[T]) -> T:
    """Run an awaitable and return the result.

    Different from `asyncio.run` in that it does not create a new event loop each time.
    """
    response: T | EllipsisType = Missing

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


class HASHClient:
    """Implementation of the client for the HASH API.

    Exposes several methods for interacting with the API.
    """

    inner: ConcurrentHASHClient

    def __init__(self, base: URL) -> None:
        """Initialize the client with the base URL."""
        self.inner = ConcurrentHASHClient(base)

    def with_actor(self, actor: UUID) -> Self:
        """Set the actor for the client."""
        self.inner.actor = actor
        return self
