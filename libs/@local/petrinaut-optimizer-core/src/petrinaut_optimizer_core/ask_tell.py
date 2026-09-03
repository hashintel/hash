"""The ask/tell loop: Optuna proposes, the caller evaluates, the study learns.

The loop owns no simulation. Each trial's values go to `evaluate`, an awaitable
the caller supplies, and the outcome is told back to the study. The browser
worker drives studies with this loop; the service keeps `study.optimize` on a
worker thread.
"""

from __future__ import annotations

import math
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


async def run_study(
    study: optuna.Study,
    description: StudyDescription,
    *,
    evaluate: Evaluate,
    on_trial: OnTrial,
    is_cancelled: IsCancelled = lambda: False,
) -> dict[str, Any]:
    """Drive `description.trials` ask/tell rounds and return the study summary.

    Cancellation is polled before each ask and after each evaluate; a cancelled
    study returns its summary early with `cancelled` set, leaving the trial in
    flight untold. An outcome that is neither a finite objective nor a pruned
    marker, and any exception from `evaluate` or `on_trial`, ends the study
    with that error.
    """
    for _ in range(description.trials):
        if is_cancelled():
            return {**study_summary(study, description.trials), "cancelled": True}
        trial = study.ask()
        outcome = await evaluate(suggest(trial, description.parameters))
        if is_cancelled():
            return {**study_summary(study, description.trials), "cancelled": True}
        objective = objective_of(outcome)
        told = (
            study.tell(trial, state=TrialState.PRUNED)
            if objective is None
            else study.tell(trial, objective)
        )
        on_trial(trial_event(study, told))
    return {**study_summary(study, description.trials), "cancelled": False}
