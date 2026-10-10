import math

import optuna
import pytest
from optuna.samplers import RandomSampler

from petrinaut_optimizer_core import importance
from petrinaut_optimizer_core.importance import (
    importance_cadence,
    importance_floor,
    parameter_importances,
)


def weighted_sum(trial: optuna.Trial) -> float:
    return 5 * trial.suggest_float("a", 0, 1) + trial.suggest_float("b", 0, 1)


@pytest.mark.parametrize("direction", ["minimize", "maximize"])
def test_importance_direction(
    direction: str,
) -> None:
    study = optuna.create_study(direction=direction, sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=40)

    importances = parameter_importances(study)

    assert importances is not None
    assert set(importances) == {"a", "b"}
    assert importances["a"] > importances["b"]
    assert sum(importances.values()) == pytest.approx(1.0)


def test_importance_pruned_and_boolean() -> None:
    def objective(trial: optuna.Trial) -> float:
        rate = trial.suggest_float("rate", 0.1, 2.0, log=True)
        enabled = trial.suggest_categorical("enabled", [False, True])
        if trial.number % 9 == 8:
            raise optuna.TrialPruned
        return rate + int(enabled)

    study = optuna.create_study(sampler=RandomSampler(seed=1))
    study.optimize(objective, n_trials=45)

    importances = parameter_importances(study)

    assert importances is not None
    assert set(importances) == {"rate", "enabled"}
    completed = study.get_trials(states=(optuna.trial.TrialState.COMPLETE,))
    complete_only = optuna.create_study()
    complete_only.add_trials(completed)
    assert importances == parameter_importances(complete_only)


def test_importance_insufficient_trials() -> None:
    assert parameter_importances(optuna.create_study()) is None

    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=1)
    assert parameter_importances(study) is None


def test_importance_single_parameter() -> None:
    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(lambda trial: trial.suggest_float("a", 0, 1), n_trials=10)

    assert parameter_importances(study) is None


@pytest.mark.parametrize("error", [RuntimeError, ValueError, KeyError])
def test_importance_evaluator_error(
    monkeypatch: pytest.MonkeyPatch, error: type[Exception]
) -> None:
    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=10)

    def explode(*_args: object, **_kwargs: object) -> dict[str, float]:
        raise error("numpy went away")

    monkeypatch.setattr(importance, "get_param_importances", explode)

    assert parameter_importances(study) is None


def test_importance_cadence_and_floor() -> None:
    assert importance_cadence(30) == 10
    assert importance_cadence(200) == 10
    assert importance_cadence(400) == 20
    assert importance_floor(30) == 50
    assert importance_floor(99) == 50
    assert importance_floor(100) == 100
    assert importance_floor(1_000) == 100


def test_importance_interrupt(monkeypatch: pytest.MonkeyPatch) -> None:
    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=10)

    def interrupt(*_args: object, **_kwargs: object) -> dict[str, float]:
        raise KeyboardInterrupt

    monkeypatch.setattr(importance, "get_param_importances", interrupt)

    with pytest.raises(KeyboardInterrupt):
        parameter_importances(study)


@pytest.mark.parametrize("value", [math.inf, math.nan, -0.1])
def test_importance_invalid_weight(monkeypatch: pytest.MonkeyPatch, value: float) -> None:
    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=10)

    def invalid(*_args: object, **_kwargs: object) -> dict[str, float]:
        return {"a": value, "b": 0.5}

    monkeypatch.setattr(importance, "get_param_importances", invalid)

    assert parameter_importances(study) is None
