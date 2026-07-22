"""Bound cleanup for transports owned by application entry points."""

from typing import Protocol

import trio

_OWNED_TRANSPORT_CLOSE_TIMEOUT_SECONDS = 15.0


class _AsyncCloseable(Protocol):
    async def aclose(self) -> None: ...


async def close_owned_transport(transport: _AsyncCloseable) -> None:
    """Finish owned cleanup despite caller cancellation, up to a fixed bound."""
    with trio.fail_after(_OWNED_TRANSPORT_CLOSE_TIMEOUT_SECONDS, shield=True):
        await transport.aclose()
