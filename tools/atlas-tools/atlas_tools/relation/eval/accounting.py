"""Thread-safe cost authorization for concurrent physical requests."""

from collections.abc import Callable, Sequence
from threading import Lock
from typing import Self

from atlas_tools.relation.eval.schema import PhysicalAttemptRow
from atlas_tools.relation.eval.transport import UsageAccounting, aggregate_physical_usage


class CostLimitReachedError(RuntimeError):
    """A physical request was denied by the configured central cost gate."""


class CostGate:
    """Authorize physical requests against thread-safe, durably known costs."""

    def __init__(self, *, maximum_usd: float | None, accounting: UsageAccounting) -> None:
        self._maximum_usd = maximum_usd
        self._known_cost_usd = accounting.known_cost_usd
        self._cost_complete = accounting.cost_complete
        self._authorized_requests = 0
        self._lock = Lock()

    @classmethod
    def from_attempts(
        cls,
        *,
        maximum_usd: float | None,
        attempts: Sequence[PhysicalAttemptRow],
    ) -> Self:
        return cls(
            maximum_usd=maximum_usd,
            accounting=aggregate_physical_usage(attempts),
        )

    def authorize(self) -> None:
        """Authorize one request immediately before its durable in-flight marker."""
        with self._lock:
            if self._maximum_usd is not None:
                if not self._cost_complete:
                    raise CostLimitReachedError(
                        "cannot enforce max_cost_usd with incomplete provider costs"
                    )
                if self._known_cost_usd >= self._maximum_usd:
                    raise CostLimitReachedError(
                        f"executor cost cap reached at ${self._known_cost_usd:.6f}"
                    )
            self._authorized_requests += 1

    def release_unspent(self) -> None:
        """Release authorization when no paid call began."""
        with self._lock:
            self._finish_authorization()

    def settle_attempt(
        self,
        attempt: PhysicalAttemptRow,
        persist: Callable[[], None],
    ) -> None:
        """Serialize durable publication and cost settlement against new authorizations."""
        accounting = aggregate_physical_usage([attempt])
        if self._maximum_usd is None:
            try:
                persist()
            except BaseException:
                self.record_unknown_outcome()
                raise
            with self._lock:
                self._apply_accounting(accounting)
            return

        with self._lock:
            try:
                persist()
            except BaseException:
                self._finish_authorization()
                self._cost_complete = False
                raise
            self._apply_accounting(accounting)

    def record_unknown_outcome(self) -> None:
        """Close an authorization whose paid outcome could not be journaled."""
        with self._lock:
            self._finish_authorization()
            self._cost_complete = False

    def _apply_accounting(self, accounting: UsageAccounting) -> None:
        self._finish_authorization()
        self._known_cost_usd += accounting.known_cost_usd
        self._cost_complete = self._cost_complete and accounting.cost_complete

    def _finish_authorization(self) -> None:
        if self._authorized_requests <= 0:
            raise RuntimeError("cost gate completed a request that it did not authorize")
        self._authorized_requests -= 1
