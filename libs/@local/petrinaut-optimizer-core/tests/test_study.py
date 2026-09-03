from __future__ import annotations

from typing import Any

import optuna
from optuna.trial import TrialState

from petrinaut_optimizer_core import (
    best_summary,
    create_study,
    parse_description,
    study_summary,
    suggest,
    trial_event,
)


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


def test_sampler_options_override_the_description_seed(
    optimization_description: dict[str, Any],
) -> None:
    description = parse_description(optimization_description)

    def first_suggestion(**sampler_options: Any) -> dict[str, Any]:
        study = create_study(description, **sampler_options)
        return suggest(study.ask(), description.parameters)

    assert first_suggestion(seed=7) == first_suggestion(seed=7)
    assert first_suggestion(seed=7) != first_suggestion()


def test_builds_the_sampler_and_direction_from_the_description(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["direction"] = "minimize"
    optimization_description["study"]["sampler"] = "tpe"
    study = create_study(parse_description(optimization_description))

    assert isinstance(study.sampler, optuna.samplers.TPESampler)
    assert study.direction is optuna.study.StudyDirection.MINIMIZE


def test_trial_events_and_summary_track_best_and_states(
    optimization_description: dict[str, Any],
) -> None:
    description = parse_description(optimization_description)
    study = create_study(description)

    assert best_summary(study) is None

    first = study.ask()
    suggest(first, description.parameters)
    first_event = trial_event(study, study.tell(first, 1.5))
    second = study.ask()
    suggest(second, description.parameters)
    second_event = trial_event(study, study.tell(second, state=TrialState.PRUNED))
    third = study.ask()
    suggest(third, description.parameters)
    third_event = trial_event(study, study.tell(third, 4.0))

    assert first_event == {
        "trial": 0,
        "parameters": dict(first.params),
        "objective": 1.5,
        "state": "complete",
        "best": {"trial": 0, "parameters": dict(first.params), "objective": 1.5},
    }
    assert second_event["state"] == "pruned"
    assert second_event["objective"] is None
    assert second_event["best"]["trial"] == 0
    assert third_event["best"] == {
        "trial": 2,
        "parameters": dict(third.params),
        "objective": 4.0,
    }
    assert study_summary(study, description.trials) == {
        "requestedTrials": 3,
        "completedTrials": 2,
        "prunedTrials": 1,
        "failedTrials": 0,
        "best": third_event["best"],
    }
