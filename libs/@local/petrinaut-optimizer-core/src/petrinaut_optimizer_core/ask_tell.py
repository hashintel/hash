"""The ask/tell loop: Optuna proposes, the caller evaluates, the study learns.

The loop owns no simulation. Each trial's values go to `evaluate`, an awaitable
the caller supplies, and the outcome is told back to the study. The browser
worker drives studies with this loop; the service keeps `study.optimize` on a
worker thread.
"""

from __future__ import annotations

import asyncio
import math
from collections import deque
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, TypeAlias

import optuna
from optuna.trial import TrialState

from .description import StudyDescription
from .study import Scalar, study_summary, suggest, trial_event

Evaluate: TypeAlias = Callable[[dict[str, Scalar]], Awaitable[Mapping[str, Any]]]
OnTrial: TypeAlias = Callable[[dict[str, Any]], object]
IsCancelled: TypeAlias = Callable[[], bool]


def objective_of(outcome: Mapping[str, Any]) -> float | None:
    """The finite objective of an evaluated trial, or None when it was pruned.

    Accepts `{"objective": x}` and `{"pruned": reason}` as well as the channel's
    tagged forms, `{"kind": "objective", "objective": x}` and
    `{"kind": "pruned", "reason": reason}`.
    """
    if outcome.get("kind") == "pruned" or "pruned" in outcome:
        return None
    objective = outcome.get("objective")
    if (
        isinstance(objective, bool)
        or not isinstance(objective, (int, float))
        or not math.isfinite(objective)
    ):
        raise ValueError("trial objective must be a finite number")
    return float(objective)


def _tell(
    study: optuna.Study, trial: optuna.Trial, outcome: Mapping[str, Any]
) -> dict[str, Any]:
    objective = objective_of(outcome)
    told = (
        study.tell(trial, state=TrialState.PRUNED)
        if objective is None
        else study.tell(trial, objective)
    )
    return trial_event(study, told)


async def run_study(
    study: optuna.Study,
    description: StudyDescription,
    *,
    evaluate: Evaluate,
    on_trial: OnTrial,
    is_cancelled: IsCancelled = lambda: False,
    trials: int | None = None,
    parallelism: int = 1,
    requested_trials: int | None = None,
) -> dict[str, Any]:
    """Drive `trials` ask/tell rounds (the description's count by default) and return the study summary.

    The study keeps every trial it is told, so calling this again on the same
    study continues its numbering and its sampler's history. The summary counts
    every trial the study holds; `requested_trials` is the total the caller has
    asked for across calls and defaults to this call's count.

    Up to `parallelism` trials are in flight at once, each evaluated in its own
    task; outcomes are told, and `on_trial` called, in completion order.
    Cancellation is polled before each ask and after each evaluate; a cancelled
    study waits for the evaluations in flight to settle, reports none of them,
    tells every trial it asked and did not report as failed so the sampler
    gives it no weight, and returns its summary early with `cancelled` set. An
    outcome that is neither a finite objective nor a pruned marker, and any
    exception from `evaluate` or `on_trial`, ends the study with that error
    after cancelling the evaluations still in flight.
    """
    count = description.trials if trials is None else trials
    if count < 1:
        raise ValueError("an optimization run must ask for at least 1 trial")
    if parallelism < 1:
        raise ValueError("optimization parallelism must be at least 1")
    requested = count if requested_trials is None else requested_trials

    settled: deque[tuple[optuna.Trial, Mapping[str, Any]]] = deque()
    in_flight: set[asyncio.Task[None]] = set()
    untold: dict[int, optuna.Trial] = {}

    async def evaluate_trial(trial: optuna.Trial, values: dict[str, Scalar]) -> None:
        settled.append((trial, await evaluate(values)))

    def tell_settled() -> None:
        while settled:
            trial, outcome = settled.popleft()
            del untold[trial.number]
            on_trial(_tell(study, trial, outcome))

    asked = 0
    cancelled = False
    try:
        while asked < count or in_flight:
            if is_cancelled():
                cancelled = True
                break
            while asked < count and len(in_flight) < parallelism:
                trial = study.ask()
                untold[trial.number] = trial
                values = suggest(trial, description.parameters)
                in_flight.add(asyncio.ensure_future(evaluate_trial(trial, values)))
                asked += 1
            done, _ = await asyncio.wait(in_flight, return_when=asyncio.FIRST_COMPLETED)
            in_flight.difference_update(done)
            for task in done:
                task.result()
            if is_cancelled():
                cancelled = True
                break
            tell_settled()
    except BaseException:
        for task in in_flight:
            task.cancel()
        raise
    finally:
        if in_flight:
            await asyncio.gather(*in_flight, return_exceptions=True)
    for trial in untold.values():
        study.tell(trial, state=TrialState.FAIL)
    return {**study_summary(study, requested), "cancelled": cancelled}
