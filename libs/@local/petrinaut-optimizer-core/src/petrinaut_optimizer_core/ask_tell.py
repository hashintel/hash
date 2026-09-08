"""The ask/tell loop: Optuna proposes, the caller evaluates, the study learns.

The loop owns no simulation. Each trial's values go to `evaluate`, an awaitable
the caller supplies, and the outcome is told back to the study. The shapes the
loop reports, one event per told trial and one summary per run, are built here
too.
"""

from __future__ import annotations

import asyncio
import math
from collections import deque
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, TypeAlias

import optuna
from optuna.trial import FrozenTrial, TrialState

from .description import StudyDescription
from .study import Scalar, suggest

Evaluate: TypeAlias = Callable[[dict[str, Scalar]], Awaitable[Mapping[str, Any]]]
OnTrial: TypeAlias = Callable[[dict[str, Any]], object]
IsCancelled: TypeAlias = Callable[[], bool]

_STATE_NAMES = {
    TrialState.COMPLETE: "complete",
    TrialState.PRUNED: "pruned",
    TrialState.FAIL: "failed",
}


def objective_of(outcome: Mapping[str, Any]) -> float | None:
    """The finite objective of `{"objective": x}`, or None for `{"pruned": reason}`."""
    if "pruned" in outcome:
        return None
    objective = outcome.get("objective")
    if (
        isinstance(objective, bool)
        or not isinstance(objective, (int, float))
        or not math.isfinite(objective)
    ):
        raise ValueError("trial objective must be a finite number")
    return float(objective)


def best_summary(study: optuna.Study) -> dict[str, Any] | None:
    """The best completed trial, or None while no trial has completed."""
    try:
        best = study.best_trial
    except ValueError:
        return None
    return {
        "trial": best.number,
        "parameters": dict(best.params),
        "objective": best.value,
    }


def trial_event(study: optuna.Study, trial: FrozenTrial) -> dict[str, Any]:
    return {
        "trial": trial.number,
        "parameters": dict(trial.params),
        "objective": trial.value,
        "state": _STATE_NAMES[trial.state],
        "best": best_summary(study),
    }


def told_trials(study: optuna.Study) -> int:
    """How many of the study's trials were told an outcome the loop reported: complete or pruned.

    A trial failed by a stop produced no event, so it is not counted and a
    continued study heads for the total its caller sees.
    """
    return sum(
        1
        for trial in study.get_trials(deepcopy=False)
        if trial.state in (TrialState.COMPLETE, TrialState.PRUNED)
    )


def study_summary(study: optuna.Study) -> dict[str, Any]:
    states = [trial.state for trial in study.get_trials(deepcopy=False)]
    return {
        "completedTrials": states.count(TrialState.COMPLETE),
        "prunedTrials": states.count(TrialState.PRUNED),
        "failedTrials": states.count(TrialState.FAIL),
        "best": best_summary(study),
    }


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
    trials: int,
    evaluate: Evaluate,
    on_trial: OnTrial,
    is_cancelled: IsCancelled = lambda: False,
    parallelism: int = 1,
) -> dict[str, Any]:
    """Drive `trials` ask/tell rounds and return the study summary.

    The study keeps every trial it is told, so calling this again on the same
    study continues its numbering and its sampler's history, and the summary
    counts every trial the study holds.

    Up to `parallelism` trials are in flight at once, each evaluated in its own
    task; outcomes are told, and `on_trial` called, in completion order.
    Cancellation is polled once before each batch of up to `parallelism` asks
    and once after each wait for an evaluation to settle. A cancelled study
    waits for the evaluations in flight to settle, reports none of them, and
    returns its summary early with `cancelled` set. An outcome that is neither
    a finite objective nor a pruned marker, and any exception from `evaluate`
    or `on_trial`, ends the study with that error after cancelling the
    evaluations still in flight. Either way, every trial asked and not
    reported is told failed so the sampler gives it no weight.
    """
    if trials < 1:
        raise ValueError("an optimization run must ask for at least 1 trial")
    if parallelism < 1:
        raise ValueError("optimization parallelism must be at least 1")

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
        while asked < trials or in_flight:
            if is_cancelled():
                cancelled = True
                break
            while asked < trials and len(in_flight) < parallelism:
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
    return {**study_summary(study), "cancelled": cancelled}
