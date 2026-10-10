"""Completion barriers for application-owned resource cleanup."""

import asyncio


async def join_task[T](task: asyncio.Future[T]) -> T:
    """Join owned work before propagating cancellation of the waiting task.

    Unlike a single shield, repeated cancellation cannot interrupt this join.
    Use only for cleanup that must finish before its resources can be released.
    """
    cancellation: asyncio.CancelledError | None = None
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError as error:
            cancellation = error

    result = task.result()
    if cancellation is not None:
        raise cancellation

    return result
