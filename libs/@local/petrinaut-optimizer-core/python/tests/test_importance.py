from __future__ import annotations

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
def test_ranks_the_heavier_parameter_first_in_either_direction(
    direction: str,
) -> None:
    study = optuna.create_study(direction=direction, sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=40)

    importances = parameter_importances(study)

    assert importances is not None
    assert set(importances) == {"a", "b"}
    assert importances["a"] > importances["b"]
    assert sum(importances.values()) == pytest.approx(1.0)


def test_pruned_trials_are_left_out_and_booleans_take_part() -> None:
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


def test_none_without_two_completed_trials() -> None:
    assert parameter_importances(optuna.create_study()) is None

    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=1)
    assert parameter_importances(study) is None


def test_none_for_a_single_parameter() -> None:
    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(lambda trial: trial.suggest_float("a", 0, 1), n_trials=10)

    assert parameter_importances(study) is None


def test_an_evaluator_failure_yields_none(monkeypatch: pytest.MonkeyPatch) -> None:
    study = optuna.create_study(sampler=RandomSampler(seed=0))
    study.optimize(weighted_sum, n_trials=10)

    def explode(*_args: object, **_kwargs: object) -> dict[str, float]:
        raise RuntimeError("numpy went away")

    monkeypatch.setattr(importance, "get_param_importances", explode)

    assert parameter_importances(study) is None


def test_the_cadence_and_the_floor_follow_the_requested_trials() -> None:
    assert importance_cadence(30) == 10
    assert importance_cadence(200) == 10
    assert importance_cadence(400) == 20
    assert importance_floor(30) == 50
    assert importance_floor(99) == 50
    assert importance_floor(100) == 100
    assert importance_floor(1_000) == 100
