"""Evaluate production-grid outcomes at the execution boundary."""

from collections import deque
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from math import isfinite
from typing import Literal, Protocol, Self

from atlas_tools.relation.evaluation.domain.api import (
    AccountingFailure,
    AttemptFailure,
    GuardConfig,
    JudgeFamilyId,
    PhysicalAttempt,
    ProviderResult,
    ResponseFailure,
    RoutingFailure,
    TransientRetryConfig,
    TransportFailure,
    failure_statuses,
)
from atlas_tools.relation.evaluation.transport.api import (
    CompletionAccepted,
    CompletionFailed,
    CompletionOutcome,
    CompletionRejected,
    CompletionRequest,
)

_GRID_POLICY_TYPE = "atlas_tools.relation.evaluation.execution.guard.GridGuardPolicy"
_CLIENT_ERROR_MIN = 400
_CLIENT_ERROR_MAX = 500


def _require_non_negative_int(value: object, *, name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    if value < 0:
        raise ValueError(f"{name} must be non-negative")


def _validate_recent_costs(costs: object) -> None:
    if not isinstance(costs, tuple):
        raise TypeError("recent_costs_usd must be a tuple")
    for cost in costs:
        if isinstance(cost, bool) or not isinstance(cost, int | float):
            raise TypeError("recent billed costs must be numeric")
        if not isfinite(cost) or cost < 0.0:
            raise ValueError("recent billed costs must be finite and non-negative")


class CompletionPolicy(Protocol):
    """Transform one expected provider outcome before it becomes durable."""

    def evaluate(
        self,
        request: CompletionRequest,
        outcome: CompletionOutcome,
    ) -> CompletionOutcome:
        """Return the outcome execution must persist and act upon."""
        ...


@dataclass(frozen=True, slots=True, kw_only=True)
class GridGuardFamilySeed:
    """Exact durable guard state for one fresh grid family.

    Billed calls and cache evidence come from attempts carrying a provider
    result. Accepted results establish the family. Recent costs retain journal
    order and contain at most the configured guard window.
    """

    family_id: JudgeFamilyId
    established: bool = False
    billed_calls: int = 0
    cached_tokens: int = 0
    recent_costs_usd: tuple[float, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.family_id, JudgeFamilyId):
            raise TypeError("family_id must be a JudgeFamilyId")
        if not self.family_id:
            raise ValueError("family_id must not be empty")
        if not isinstance(self.established, bool):
            raise TypeError("established must be a boolean")
        _require_non_negative_int(self.billed_calls, name="billed_calls")
        _require_non_negative_int(self.cached_tokens, name="cached_tokens")
        _validate_recent_costs(self.recent_costs_usd)
        if len(self.recent_costs_usd) > self.billed_calls:
            raise ValueError("recent billed costs cannot outnumber billed calls")
        if self.established and self.billed_calls == 0:
            raise ValueError("an established family requires a billed call")
        if self.cached_tokens and self.billed_calls == 0:
            raise ValueError("cache evidence requires a billed call")


@dataclass(slots=True)
class _FamilyState:
    established: bool = False
    billed_calls: int = 0
    cached_tokens: int = 0
    recent_costs: deque[float] = field(default_factory=deque)

    @classmethod
    def from_seed(cls, seed: GridGuardFamilySeed) -> Self:
        return cls(
            established=seed.established,
            billed_calls=seed.billed_calls,
            cached_tokens=seed.cached_tokens,
            recent_costs=deque(seed.recent_costs_usd),
        )

    def record_billed_result(self, result: ProviderResult, *, cost_window: int) -> None:
        self.billed_calls += 1
        usage = result.usage
        if usage is None:
            return
        self.cached_tokens += usage.cached_tokens
        if usage.cost_usd is None:
            return
        self.recent_costs.append(usage.cost_usd)
        while len(self.recent_costs) > cost_window:
            self.recent_costs.popleft()

    def seed(self, family_id: JudgeFamilyId) -> GridGuardFamilySeed:
        return GridGuardFamilySeed(
            family_id=family_id,
            established=self.established,
            billed_calls=self.billed_calls,
            cached_tokens=self.cached_tokens,
            recent_costs_usd=tuple(self.recent_costs),
        )


def grid_guard_family_seeds(
    attempts: Iterable[PhysicalAttempt],
    *,
    cost_window: int,
) -> tuple[GridGuardFamilySeed, ...]:
    """Reconstruct fresh-grid guard state from closed physical attempts.

    Accepted and locally rejected attempts carry provider results, so both
    advance the billed-call count and contribute any usage, cache, and cost
    evidence. Failed attempts without a provider result do not advance the
    cache checkpoint. Accepted attempts alone establish a family.

    Families are returned in ascending ID order. Runtime is `O(A + F log F)`
    for `A` attempts across `F` families, with `O(F * cost_window)` retained
    cost evidence.

    Raises:
        ValueError: `cost_window` is not a positive integer.
    """
    if isinstance(cost_window, bool) or not isinstance(cost_window, int) or cost_window <= 0:
        raise ValueError("cost_window must be a positive integer")

    states: dict[JudgeFamilyId, _FamilyState] = {}
    for attempt in attempts:
        result = attempt.result
        if result is None:
            continue
        state = states.setdefault(attempt.family_id, _FamilyState())
        state.record_billed_result(result, cost_window=cost_window)
        if attempt.failure is None:
            state.established = True
    return tuple(states[family_id].seed(family_id) for family_id in sorted(states))


def _session_failure(
    failure: AttemptFailure,
    *,
    message: str,
) -> AttemptFailure:
    return failure.model_copy(
        update={
            "exception_type": _GRID_POLICY_TYPE,
            "message": message,
            "scope": "session",
        }
    )


def _policy_failure(
    *,
    category: Literal["response", "routing", "accounting"],
    message: str,
) -> AttemptFailure:
    match category:
        case "response":
            return ResponseFailure(
                exception_type=_GRID_POLICY_TYPE,
                message=message,
                scope="session",
            )
        case "routing":
            return RoutingFailure(
                exception_type=_GRID_POLICY_TYPE,
                message=message,
                scope="session",
            )
        case "accounting":
            return AccountingFailure(
                exception_type=_GRID_POLICY_TYPE,
                message=message,
                scope="session",
            )


def _opening_failure_pages(
    failure: AttemptFailure,
    retry_policy: TransientRetryConfig,
) -> bool:
    if failure.scope == "session":
        return True
    statuses = failure_statuses(failure)
    retryable = set(retry_policy.status_codes)
    if any(
        _CLIENT_ERROR_MIN <= status < _CLIENT_ERROR_MAX and status not in retryable
        for status in statuses
    ):
        return True
    if any(status in retryable for status in statuses):
        return False
    return not (
        isinstance(failure, TransportFailure)
        and not statuses
        and retry_policy.retry_transport_errors
    )


class GridGuardPolicy:
    """Turn roster, cache, and cost drift into explicit session outcomes.

    The caller serializes each family and passes only fresh provider exchanges.
    Family seeds restore the exact billed-call, cache, establishment, and cost
    state reconstructed from durable attempts. Live evaluation applies the same
    transition: provider results count, while failures without results do not.
    """

    __slots__ = (
        "_config",
        "_parse",
        "_pilot_costs",
        "_retry_policy",
        "_states",
    )

    def __init__(
        self,
        *,
        config: GuardConfig,
        retry_policy: TransientRetryConfig,
        pilot_cost_per_vote_usd: Mapping[JudgeFamilyId, int | float],
        parse_verdict: Callable[[str], object],
        family_seeds: Iterable[GridGuardFamilySeed] = (),
    ) -> None:
        self._config = config
        self._retry_policy = retry_policy
        self._pilot_costs = dict(pilot_cost_per_vote_usd)
        self._parse = parse_verdict
        self._states = self._initial_states(family_seeds)

    def _initial_states(
        self,
        seeds: Iterable[GridGuardFamilySeed],
    ) -> dict[JudgeFamilyId, _FamilyState]:
        states: dict[JudgeFamilyId, _FamilyState] = {}
        for seed in seeds:
            if seed.family_id in states:
                raise ValueError(f"family seeds repeat {seed.family_id}")
            if len(seed.recent_costs_usd) > self._config.cost_window:
                raise ValueError(
                    f"family seed for {seed.family_id} exceeds the configured cost window"
                )
            states[seed.family_id] = _FamilyState.from_seed(seed)
        return states

    def evaluate(
        self,
        request: CompletionRequest,
        outcome: CompletionOutcome,
    ) -> CompletionOutcome:
        """Apply one family's guard state without hiding billable evidence."""
        family_id = request.judge.family_id
        state = self._states.setdefault(family_id, _FamilyState())
        unproven_opening = not state.established

        if isinstance(outcome, CompletionAccepted):
            state.record_billed_result(
                outcome.result,
                cost_window=self._config.cost_window,
            )
        elif isinstance(outcome, CompletionRejected):
            state.record_billed_result(
                outcome.billed_result,
                cost_window=self._config.cost_window,
            )

        if isinstance(outcome, CompletionRejected):
            cost_failure = self._cost_failure(family_id, state)
            if cost_failure is not None:
                return CompletionRejected(
                    failure=cost_failure,
                    billed_result=outcome.billed_result,
                )

        if isinstance(outcome, CompletionFailed | CompletionRejected):
            if not unproven_opening or not _opening_failure_pages(
                outcome.failure,
                self._retry_policy,
            ):
                return outcome
            failure = _session_failure(
                outcome.failure,
                message=(
                    f"first-vote check failed for {family_id}: the opening "
                    f"provider exchange failed ({outcome.failure.message})"
                ),
            )
            if isinstance(outcome, CompletionRejected):
                return CompletionRejected(
                    failure=failure,
                    billed_result=outcome.billed_result,
                )
            return CompletionFailed(failure=failure)

        guarded = self._accepted_outcome(request, outcome, state)
        if isinstance(guarded, CompletionAccepted):
            state.established = True
        return guarded

    def _accepted_outcome(
        self,
        request: CompletionRequest,
        outcome: CompletionAccepted,
        state: _FamilyState,
    ) -> CompletionOutcome:
        if not state.established:
            rejection = self._opening_rejection(request, outcome)
            if rejection is not None:
                return rejection
        return self._accounting_outcome(request, outcome, state)

    def _opening_rejection(
        self,
        request: CompletionRequest,
        outcome: CompletionAccepted,
    ) -> CompletionRejected | None:
        family_id = request.judge.family_id
        if outcome.result.model != request.judge.model:
            return self._reject(
                outcome,
                category="routing",
                message=(
                    f"first-vote check failed for {family_id}: returned model "
                    f"{outcome.result.model!r}, expected {request.judge.model!r}"
                ),
            )

        try:
            self._parse(outcome.content)
        except ValueError as error:
            return self._reject(
                outcome,
                category="response",
                message=(
                    f"first-vote check failed for {family_id}: the opening "
                    f"completion did not parse ({error})"
                ),
            )

        return None

    def _accounting_outcome(
        self,
        request: CompletionRequest,
        outcome: CompletionAccepted,
        state: _FamilyState,
    ) -> CompletionOutcome:
        family_id = request.judge.family_id
        usage = outcome.result.usage
        if usage is None:
            return self._reject(
                outcome,
                category="accounting",
                message=f"grid completion for {family_id} omitted usage",
            )

        if state.billed_calls >= self._config.cache_check_vote and state.cached_tokens <= 0:
            return self._reject(
                outcome,
                category="accounting",
                message=(
                    f"cache assertion failed for {family_id}: no cached prompt tokens "
                    f"across the first {state.billed_calls} billed results"
                ),
            )
        failure = self._cost_failure(family_id, state)
        if failure is None:
            return outcome
        return CompletionRejected(failure=failure, billed_result=outcome.result)

    def _cost_failure(
        self,
        family_id: JudgeFamilyId,
        state: _FamilyState,
    ) -> AttemptFailure | None:
        expected = self._pilot_costs.get(family_id)
        if expected is None:
            return None
        if len(state.recent_costs) < self._config.cost_window:
            return None
        rolling_mean = sum(state.recent_costs) / len(state.recent_costs)
        ceiling = self._config.cost_multiplier * expected
        if rolling_mean > ceiling:
            return _policy_failure(
                category="accounting",
                message=(
                    f"cost tripwire fired for {family_id}: rolling mean "
                    f"${rolling_mean:.6f} exceeds ${ceiling:.6f}"
                ),
            )
        return None

    @staticmethod
    def _reject(
        outcome: CompletionAccepted,
        *,
        category: Literal["response", "routing", "accounting"],
        message: str,
    ) -> CompletionRejected:
        return CompletionRejected(
            failure=_policy_failure(category=category, message=message),
            billed_result=outcome.result,
        )
