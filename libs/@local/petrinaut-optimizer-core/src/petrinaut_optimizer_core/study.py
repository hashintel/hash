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

# Optuna's own default; larger studies keep it.
OPTUNA_TPE_STARTUP_TRIALS = 10


def tpe_startup_trials(trials: int) -> int:
    """How many trials the TPE sampler draws at random before it models the objective.

    Optuna starts every TPE study with 10 random trials, which is most or all
    of a short Petrinaut study, so such a study never proposes anything from
    its results. A third of the requested trials, at least 2 and at most
    Optuna's default, leaves the sampler enough history to model while giving
    a 6-step study 4 modelled steps.
    """
    return max(2, min(OPTUNA_TPE_STARTUP_TRIALS, trials // 3))


_STATE_NAMES = {
    TrialState.COMPLETE: "complete",
    TrialState.PRUNED: "pruned",
    TrialState.FAIL: "failed",
}


def create_study(
    description: StudyDescription,
    *,
    constant_liar: bool = False,
    **sampler_options: Any,
) -> optuna.Study:
    """An in-memory study whose sampler is seeded with the description's seed unless `seed` is given.

    A TPE sampler draws `tpe_startup_trials(description.trials)` trials at
    random before modelling unless `n_startup_trials` is given. With
    `constant_liar`, the TPE sampler counts trials still running as pending
    points, so trials asked while others are in flight spread out instead of
    landing on the same candidate; Optuna flags the argument as experimental
    with an `ExperimentalWarning`. The random sampler has no history to
    account for and ignores both.
    """
    sampler_options.setdefault("seed", description.seed)
    if description.sampler == "tpe":
        sampler_options.setdefault(
            "n_startup_trials", tpe_startup_trials(description.trials)
        )
        if constant_liar:
            sampler_options["constant_liar"] = True
    sampler = SAMPLERS[description.sampler](**sampler_options)
    return optuna.create_study(direction=description.direction, sampler=sampler)


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


def study_summary(study: optuna.Study, requested_trials: int) -> dict[str, Any]:
    states = [trial.state for trial in study.get_trials(deepcopy=False)]
    return {
        "requestedTrials": requested_trials,
        "completedTrials": states.count(TrialState.COMPLETE),
        "prunedTrials": states.count(TrialState.PRUNED),
        "failedTrials": states.count(TrialState.FAIL),
        "best": best_summary(study),
    }
