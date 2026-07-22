"""Close the generated SDK's async and synchronous clients safely."""

from typing import Protocol

import trio

_SDK_CLOSE_TIMEOUT_SECONDS = 10.0


class _SdkClient(Protocol):
    async def __aexit__(
        self,
        exc_type: object,
        exc_val: object,
        exc_tb: object,
    ) -> object: ...

    def __exit__(
        self,
        exc_type: object,
        exc_val: object,
        exc_tb: object,
    ) -> object: ...


class SdkClientLifetime:
    """Serialize bounded shutdown while retaining partial close progress."""

    __slots__ = ("_async_closed", "_client", "_lock", "_sync_closed")

    def __init__(self, client: _SdkClient) -> None:
        self._client = client
        self._lock = trio.Lock()
        self._async_closed = False
        self._sync_closed = False

    async def aclose(self) -> None:
        """Close each SDK client once, retrying only unfinished work."""
        with trio.fail_after(_SDK_CLOSE_TIMEOUT_SECONDS, shield=True):
            async with self._lock:
                if not self._async_closed:
                    await self._client.__aexit__(None, None, None)
                    self._async_closed = True
                if not self._sync_closed:
                    self._client.__exit__(None, None, None)
                    self._sync_closed = True
