"""Order terminal stops against paid requests and adaptive family streams."""

from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import timedelta

import trio


class ExecutionStoppedError(RuntimeError):
    """A paid request denied because a terminal stop won the start race."""


class ExecutionControl:
    """Define the atomic start boundary for paid requests.

    A request that acquires the start boundary before a stop is shielded until
    its outcome is durable. A stop that acquires the boundary first prevents
    the request from running. Retry waits remain cancellable and wake as soon
    as a peer publishes a terminal stop.
    """

    __slots__ = ("_lock", "_reason", "_stopped")

    def __init__(self) -> None:
        self._lock = trio.Lock()
        self._stopped = trio.Event()
        self._reason: str | None = None

    @property
    def is_stopped(self) -> bool:
        """Report whether a terminal stop has been published."""
        return self._stopped.is_set()

    @property
    def reason(self) -> str | None:
        """Return the first published stop reason."""
        return self._reason

    async def stop(self, reason: str) -> None:
        """Prevent future paid requests while allowing authorized calls to drain."""
        with trio.CancelScope(shield=True):
            async with self._lock:
                if not self._stopped.is_set():
                    self._reason = reason
                    self._stopped.set()

    @asynccontextmanager
    async def paid_request(
        self,
        begin: Callable[[], Awaitable[None]],
    ) -> AsyncGenerator[None]:
        """Authorize one paid request and protect its durable outcome.

        `begin` must reserve local budget and durably create the in-flight
        marker. It runs while starts and stops are mutually ordered. Once it
        succeeds, cancellation is delayed until the caller exits the context,
        which must happen only after the attempt outcome is durable.

        Raises:
            ExecutionStoppedError: A terminal stop was published first.
        """
        await self._lock.acquire()
        if self._stopped.is_set():
            self._lock.release()
            raise ExecutionStoppedError(self._reason or "execution stopped")

        with trio.CancelScope(shield=True):
            try:
                await begin()
            except BaseException:
                self._lock.release()
                raise

            self._lock.release()
            yield

    async def wait_for_retry(self, delay: timedelta) -> None:
        """Wait for a retry deadline or fail promptly after a terminal stop."""
        if self._stopped.is_set():
            raise ExecutionStoppedError(self._reason or "execution stopped")
        with trio.move_on_after(delay.total_seconds()):
            await self._stopped.wait()
        if self._stopped.is_set():
            raise ExecutionStoppedError(self._reason or "execution stopped")


@dataclass(slots=True)
class _FamilyState:
    limiter: trio.CapacityLimiter
    window: int = 1
    successes: int = 0
    generation: int = 0


class FamilyPermit:
    """Record the structured outcome of one admitted provider exchange.

    A permit is intentionally outcome-agnostic: execution translates its
    durable attempt into either ``succeeded`` or ``failed`` without coupling
    concurrency control to transport or domain models. Exiting without an
    observation is a conservative ordinary failure and cannot grow the lane.
    """

    __slots__ = ("_closed", "_generation", "_maximum", "_observed", "_state")

    def __init__(
        self,
        *,
        maximum: int,
        state: _FamilyState,
    ) -> None:
        self._maximum = maximum
        self._state = state
        self._generation = state.generation
        self._observed = False
        self._closed = False

    def succeeded(self) -> None:
        """Count one successful exchange toward this family's next ramp."""
        self._observe()
        state = self._state
        if self._generation != state.generation or state.window >= self._maximum:
            return

        state.successes += 1
        if state.successes < state.window:
            return

        state.window = min(state.window * 2, self._maximum)
        state.successes = 0
        state.limiter.total_tokens = state.window

    def failed(self, *, rate_limited: bool = False) -> None:
        """Record failure, resetting only this family for a structured 429."""
        self._observe()

        if rate_limited:
            state = self._state
            state.window = 1
            state.successes = 0
            state.generation += 1
            state.limiter.total_tokens = 1

    def _observe(self) -> None:
        if self._closed:
            raise RuntimeError("family permit outcome was recorded after release")

        if self._observed:
            raise RuntimeError("family permit outcome was recorded more than once")

        self._observed = True

    def close(self) -> None:
        """Prevent outcome observations after the permit has been released."""
        self._closed = True


class FamilySerialiser:
    """Adapt physical-request concurrency independently for each family.

    Every family starts with one request in flight. A full current-window
    count of successful provider exchanges doubles that family's window up to
    ``maximum``. Ordinary failures do not grow the window. A structured 429
    resets only its family to one and invalidates successes from requests that
    were already in flight, while those already-authorized requests drain.

    ``maximum=1`` preserves the historical serial behavior.
    """

    __slots__ = ("_maximum", "_states")

    def __init__(self, *, maximum: int = 1) -> None:
        if isinstance(maximum, bool) or not isinstance(maximum, int) or maximum <= 0:
            raise ValueError("family concurrency maximum must be a positive integer")

        self._maximum = maximum
        self._states: dict[str, _FamilyState] = {}

    @asynccontextmanager
    async def hold(self, family_id: str) -> AsyncGenerator[FamilyPermit]:
        """Acquire an adaptive request permit for one non-empty family ID."""
        if not family_id:
            raise ValueError("family_id must not be empty")

        state = self._states.get(family_id)
        if state is None:
            state = _FamilyState(limiter=trio.CapacityLimiter(1))
            self._states[family_id] = state

        async with state.limiter:
            permit = FamilyPermit(maximum=self._maximum, state=state)
            try:
                yield permit
            finally:
                permit.close()
