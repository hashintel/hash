"""Evaluate production-grid outcomes at the execution boundary."""

from collections import deque
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from math import isfinite
from typing import Literal, Protocol

from atlas_tools.relation.evaluation.domain.api import (
    AccountingFailure,
    AttemptFailure,
    GuardConfig,
    JudgeFamilyId,
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


class CompletionPolicy(Protocol):
    """Transform one expected provider outcome before it becomes durable."""

    def evaluate(
        self,
        request: CompletionRequest,
        outcome: CompletionOutcome,
    ) -> CompletionOutcome:
        """Return the outcome execution must persist and act upon."""


@dataclass(slots=True)
class _FamilyState:
    calls: int = 0
    cached_tokens: int = 0
    recent_costs: deque[float] = field(default_factory=deque)


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
    `established_families` comes from durable, non-imported physical attempts
    with an accepted result and no failure. Cache evidence is deliberately new
    for each policy instance because a resumed provider cache may be cold.
    """

    __slots__ = (
        "_config",
        "_established",
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
        established_families: Iterable[JudgeFamilyId] = (),
        initial_billed_costs_usd: Mapping[JudgeFamilyId, Iterable[float]] | None = None,
    ) -> None:
        self._config = config
        self._retry_policy = retry_policy
        self._pilot_costs = dict(pilot_cost_per_vote_usd)
        self._parse = parse_verdict
        self._established = set(established_families)
        self._states = self._initial_states(initial_billed_costs_usd or {})

    def _initial_states(
        self,
        histories: Mapping[JudgeFamilyId, Iterable[float]],
    ) -> dict[JudgeFamilyId, _FamilyState]:
        states: dict[JudgeFamilyId, _FamilyState] = {}
        for family_id, costs in histories.items():
            if not family_id:
                raise ValueError("initial billed-cost history has an empty family ID")
            history = tuple(costs)
            if any(not isfinite(cost) or cost < 0.0 for cost in history):
                raise ValueError(f"initial billed-cost history for {family_id} is invalid")
            states[family_id] = _FamilyState(
                recent_costs=deque(history[-self._config.cost_window :])
            )
        return states

    def evaluate(
        self,
        request: CompletionRequest,
        outcome: CompletionOutcome,
    ) -> CompletionOutcome:
        """Apply one family's guard state without hiding billable evidence."""
        family_id = request.judge.family_id
        state = self._states.setdefault(family_id, _FamilyState())
        call_index = state.calls
        state.calls += 1
        unproven_opening = family_id not in self._established

        if isinstance(outcome, CompletionRejected):
            cost_failure = self._record_billed_cost(family_id, outcome.billed_result, state)
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

        guarded = self._accepted_outcome(request, outcome, call_index, state)
        if isinstance(guarded, CompletionAccepted):
            self._established.add(family_id)
        return guarded

    def _accepted_outcome(
        self,
        request: CompletionRequest,
        outcome: CompletionAccepted,
        call_index: int,
        state: _FamilyState,
    ) -> CompletionOutcome:
        family_id = request.judge.family_id
        if family_id not in self._established:
            rejection = self._opening_rejection(request, outcome)
            if rejection is not None:
                return rejection
        return self._accounting_outcome(request, outcome, call_index, state)

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
        call_index: int,
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

        state.cached_tokens += usage.cached_tokens
        if call_index + 1 >= self._config.cache_check_vote and state.cached_tokens <= 0:
            return self._reject(
                outcome,
                category="accounting",
                message=(
                    f"cache assertion failed for {family_id}: no cached prompt tokens "
                    f"across the first {call_index + 1} calls"
                ),
            )
        failure = self._record_billed_cost(family_id, outcome.result, state)
        if failure is None:
            return outcome
        return CompletionRejected(failure=failure, billed_result=outcome.result)

    def _record_billed_cost(
        self,
        family_id: JudgeFamilyId,
        result: ProviderResult,
        state: _FamilyState,
    ) -> AttemptFailure | None:
        expected = self._pilot_costs.get(family_id)
        usage = result.usage
        if expected is None or usage is None or usage.cost_usd is None:
            return None
        state.recent_costs.append(usage.cost_usd)
        while len(state.recent_costs) > self._config.cost_window:
            state.recent_costs.popleft()
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
