"""Authorize paid calls against durably known provider cost."""

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Self

import trio

from atlas_tools.relation.evaluation.domain.api import PhysicalAttempt


class CostLimitReachedError(RuntimeError):
    """A paid call denied because cost is incomplete or at the configured cap."""


@dataclass(frozen=True, slots=True, kw_only=True)
class CostSnapshot:
    """A point-in-time cost view for diagnostics and tests."""

    known_cost_usd: float
    cost_complete: bool
    outstanding_requests: int


def _attempt_cost(attempt: PhysicalAttempt) -> tuple[float, bool]:
    if attempt.result is None or attempt.result.usage is None:
        return 0.0, False
    cost = attempt.result.usage.cost_usd
    return (cost, True) if cost is not None else (0.0, False)


class CostLedger:
    """Serialize cost admission and settlement for concurrent paid calls.

    `maximum_usd` is an admission threshold over durably reported cost. Provider
    cost is known only after a call, so concurrent authorized requests may take
    final spend above the threshold. Once any outcome lacks cost, a configured
    cap fails closed until an operator reconciles billing.
    """

    __slots__ = (
        "_complete",
        "_known_cost_usd",
        "_lock",
        "_maximum_usd",
        "_outstanding",
    )

    def __init__(
        self,
        *,
        maximum_usd: float | None,
        known_cost_usd: float = 0.0,
        cost_complete: bool = True,
    ) -> None:
        if maximum_usd is not None and maximum_usd <= 0:
            raise ValueError("maximum_usd must be positive")
        if known_cost_usd < 0:
            raise ValueError("known_cost_usd must not be negative")
        self._maximum_usd = maximum_usd
        self._known_cost_usd = known_cost_usd
        self._complete = cost_complete
        self._outstanding = 0
        self._lock = trio.Lock()

    @classmethod
    def from_attempts(
        cls,
        *,
        maximum_usd: float | None,
        attempts: Sequence[PhysicalAttempt],
    ) -> Self:
        """Reconstruct cost admission from the durable attempt journal."""
        known = 0.0
        complete = True
        for attempt in attempts:
            cost, attempt_complete = _attempt_cost(attempt)
            known += cost
            complete = complete and attempt_complete
        return cls(
            maximum_usd=maximum_usd,
            known_cost_usd=known,
            cost_complete=complete,
        )

    async def reserve(self) -> None:
        """Reserve one paid-call slot at the current durable cost boundary."""
        async with self._lock:
            if self._maximum_usd is not None:
                if not self._complete:
                    raise CostLimitReachedError(
                        "cannot enforce max_cost_usd with incomplete provider costs"
                    )
                if self._known_cost_usd >= self._maximum_usd:
                    raise CostLimitReachedError(
                        f"executor cost cap reached at ${self._known_cost_usd:.6f}"
                    )
            self._outstanding += 1

    async def release_unspent(self) -> None:
        """Release a reservation when no paid transport call began."""
        async with self._lock:
            self._finish_reservation()

    async def persist_and_settle[DurableT](
        self,
        attempt: PhysicalAttempt,
        persist: Callable[[PhysicalAttempt], Awaitable[DurableT]],
    ) -> DurableT:
        """Make durable append and cost settlement one admission boundary.

        The ledger lock remains held while `persist` fsyncs the attempt. Later
        admissions therefore observe either the prior durable cost or an
        incomplete-cost state when persistence fails; there is no interval in
        which a billed response exists but admission still sees old state.

        Raises:
            BaseException: `persist` fails. The reservation is closed and
                configured cost admission fails closed afterward.

        """
        cost, complete = _attempt_cost(attempt)
        async with self._lock:
            try:
                durable = await persist(attempt)
            except BaseException:
                self._finish_reservation()
                self._complete = False
                raise

            self._known_cost_usd += cost
            self._complete = self._complete and complete
            self._finish_reservation()
            return durable

    async def snapshot(self) -> CostSnapshot:
        """Read a consistent accounting snapshot."""
        async with self._lock:
            return CostSnapshot(
                known_cost_usd=self._known_cost_usd,
                cost_complete=self._complete,
                outstanding_requests=self._outstanding,
            )

    def _finish_reservation(self) -> None:
        if self._outstanding <= 0:
            raise RuntimeError("cost ledger settled a request it did not reserve")
        self._outstanding -= 1
