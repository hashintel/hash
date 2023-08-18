from __future__ import annotations

from asyncio import Event
from typing import TYPE_CHECKING, Generic, TypeVar

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

T = TypeVar("T")


class Cache(Generic[T]):
    _cache: dict[str, T]
    _pending: dict[str, Event]

    def __init__(self) -> None:
        self._cache = {}
        self._pending = {}

    async def get(self, key: str, *, on_miss: Callable[[], Awaitable[T]]) -> T:
        if value := self._cache.get(key):
            return value

        if event := self._pending.get(key):
            await event.wait()
            return self._cache[key]

        event = Event()
        self._pending[key] = event

        try:
            value = await on_miss()
            self._cache[key] = value
        finally:
            event.set()
            del self._pending[key]

        return value
