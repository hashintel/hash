from __future__ import annotations

import warnings
from typing import Any

import optuna
import pytest
from optuna.exceptions import ExperimentalWarning

from petrinaut_optimizer_core import create_study, parse_description, suggest
from petrinaut_optimizer_core.study import tpe_startup_trials


def test_maps_float_integer_step_and_boolean_descriptors_to_optuna(
    optimization_description: dict[str, Any],
) -> None:
    description = parse_description(optimization_description)
    trial = optuna.trial.FixedTrial({"rate": 0.5, "count": 6, "enabled": False})

    assert suggest(trial, description.parameters) == {
        "rate": 0.5,
        "count": 6,
        "enabled": False,
    }
    distributions = trial.distributions
    assert isinstance(distributions["rate"], optuna.distributions.FloatDistribution)
    assert distributions["rate"].log is True
    assert isinstance(distributions["count"], optuna.distributions.IntDistribution)
    assert distributions["count"].step == 2
    assert distributions["count"].log is False
    assert isinstance(
        distributions["enabled"], optuna.distributions.CategoricalDistribution
    )
    assert distributions["enabled"].choices == (False, True)


def test_uses_the_description_seed_for_deterministic_sampling(
    optimization_description: dict[str, Any],
) -> None:
    description = parse_description(optimization_description)
    first = create_study(description)
    second = create_study(description)

    assert suggest(first.ask(), description.parameters) == suggest(
        second.ask(), description.parameters
    )


def test_builds_the_sampler_and_direction_from_the_description(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["direction"] = "minimize"
    optimization_description["study"]["sampler"] = "tpe"
    study = create_study(parse_description(optimization_description))

    assert isinstance(study.sampler, optuna.samplers.TPESampler)
    assert study.direction is optuna.study.StudyDirection.MINIMIZE


def test_constant_liar_reaches_only_the_tpe_sampler(
    optimization_description: dict[str, Any],
) -> None:
    random_description = parse_description(optimization_description)
    optimization_description["study"]["sampler"] = "tpe"
    tpe_description = parse_description(optimization_description)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ExperimentalWarning)
        random_study = create_study(random_description, constant_liar=True)
        liar_study = create_study(tpe_description, constant_liar=True)
    plain_study = create_study(tpe_description)

    assert isinstance(random_study.sampler, optuna.samplers.RandomSampler)
    assert liar_study.sampler._constant_liar is True
    assert plain_study.sampler._constant_liar is False


@pytest.mark.parametrize(
    ("trials", "startup"),
    [(1, 2), (5, 2), (6, 2), (9, 3), (12, 4), (30, 10), (1000, 10)],
)
def test_tpe_startup_trials_are_a_third_of_the_study_within_two_and_ten(
    trials: int, startup: int
) -> None:
    assert tpe_startup_trials(trials) == startup


def test_tpe_study_models_after_its_scaled_startup_trials(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"] = {"trials": 6, "sampler": "tpe", "seed": 42}
    description = parse_description(optimization_description)
    study = create_study(description)
    # Optuna keeps the count on the sampler; nothing public exposes it.
    assert study.sampler._n_startup_trials == 2

    # After two random trials the proposals depend on the objectives told,
    # so two studies told different values part ways from the third trial.
    def third_suggestion(objectives: list[float]) -> dict[str, Any]:
        seeded = create_study(description)
        for objective in objectives:
            trial = seeded.ask()
            suggest(trial, description.parameters)
            seeded.tell(trial, objective)
        return suggest(seeded.ask(), description.parameters)

    assert third_suggestion([1.0, 2.0]) != third_suggestion([2.0, 1.0])


def test_the_random_sampler_receives_the_seed_alone(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"] = {"trials": 6, "sampler": "random", "seed": 42}
    random_study = create_study(parse_description(optimization_description))

    assert isinstance(random_study.sampler, optuna.samplers.RandomSampler)
    assert not hasattr(random_study.sampler, "_n_startup_trials")
