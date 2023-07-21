from asyncio import Event
from collections.abc import Awaitable, Callable
from typing import Generic, TypeVar

T = TypeVar("T")


class Cache(Generic[T]):
    _cache = dict[str, T]
    _pending: dict[str, Event]

    def __init__(self) -> None:
        self._cache = {}
        self._pending = {}

    async def get(self, key: str, *, on_miss: Callable[[], Awaitable[T]]) -> T:
        if key in self._cache:
            return self._cache[key]

        if key in self._pending:
            event = self._pending[key]
            await event.wait()
            return self._cache[key]

        event = Event()
        self._pending[key] = event

        try:
            value = await on_miss()
        finally:
            event.set()
            del self._pending[key]

        self._cache[key] = value
        return value
