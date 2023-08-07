"""Blocking API for the Graph SDK.

This is just a thin wrapper around the async API.

(Usually, one could achieve this by simply wrapping the async API automatically,
the problem with that approach however is that users loose the ability to look
at the source code)
"""
import asyncio
from collections.abc import Awaitable
from typing import TYPE_CHECKING, Self, TypeVar
from uuid import UUID

from yarl import URL

from graph_sdk.client.concurrent import HASHClient as ConcurrentHASHClient


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
