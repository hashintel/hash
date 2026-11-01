"""Optuna study construction and value suggestion."""

from collections.abc import Sequence
from typing import assert_never

import optuna
from optuna.samplers import RandomSampler, TPESampler
from optuna.trial import BaseTrial

from .description import (
    FloatParameter,
    IntParameter,
    Parameter,
    StudyDescription,
)

type Scalar = int | float | bool

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


def create_study(description: StudyDescription, *, constant_liar: bool = False) -> optuna.Study:
    """Create an in-memory study whose sampler is seeded with the description's seed.

    A TPE sampler draws `tpe_startup_trials(description.trials)` trials at
    random before modelling. With `constant_liar`, it counts trials still
    running as pending points, so trials asked while others are in flight
    spread out instead of landing on the same candidate; Optuna flags the
    argument as experimental with an `ExperimentalWarning`. The random sampler
    receives the seed alone.
    """
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    match description.sampler:
        case "tpe":
            sampler = TPESampler(
                seed=description.seed,
                n_startup_trials=tpe_startup_trials(description.trials),
                constant_liar=constant_liar,
            )
        case "random":
            sampler = RandomSampler(seed=description.seed)
        case sampler:
            assert_never(sampler)

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
