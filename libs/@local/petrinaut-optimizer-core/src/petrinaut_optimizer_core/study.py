"""Optuna study construction, value suggestion, and the per-trial event shapes."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, TypeAlias

import optuna
from optuna.samplers import BaseSampler, RandomSampler, TPESampler
from optuna.trial import BaseTrial, FrozenTrial, TrialState

from .description import (
    FloatParameter,
    IntParameter,
    Parameter,
    SamplerName,
    StudyDescription,
)

optuna.logging.set_verbosity(optuna.logging.WARNING)

Scalar: TypeAlias = int | float | bool

SAMPLERS: dict[SamplerName, type[BaseSampler]] = {
    "tpe": TPESampler,
    "random": RandomSampler,
}

_STATE_NAMES = {
    TrialState.COMPLETE: "complete",
    TrialState.PRUNED: "pruned",
    TrialState.FAIL: "failed",
}


def create_study(description: StudyDescription, **sampler_options: Any) -> optuna.Study:
    """An in-memory study whose sampler is seeded with the description's seed unless `seed` is given."""
    sampler_options.setdefault("seed", description.seed)
    return optuna.create_study(
        direction=description.direction,
        sampler=SAMPLERS[description.sampler](**sampler_options),
    )


def suggest(trial: BaseTrial, parameters: Sequence[Parameter]) -> dict[str, Scalar]:
    """Ask Optuna for one value per described parameter."""
    values: dict[str, Scalar] = {}
    for parameter in parameters:
        if isinstance(parameter, FloatParameter):
            values[parameter.identifier] = trial.suggest_float(
                parameter.identifier,
                parameter.minimum,
                parameter.maximum,
                log=parameter.log,
            )
        elif isinstance(parameter, IntParameter):
            values[parameter.identifier] = trial.suggest_int(
                parameter.identifier,
                parameter.minimum,
                parameter.maximum,
                step=parameter.step,
                log=parameter.log,
            )
        else:
            values[parameter.identifier] = trial.suggest_categorical(
                parameter.identifier, [False, True]
            )
    return values


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


def study_summary(study: optuna.Study, requested_trials: int) -> dict[str, Any]:
    states = [trial.state for trial in study.get_trials(deepcopy=False)]
    return {
        "requestedTrials": requested_trials,
        "completedTrials": states.count(TrialState.COMPLETE),
        "prunedTrials": states.count(TrialState.PRUNED),
        "failedTrials": states.count(TrialState.FAIL),
        "best": best_summary(study),
    }
