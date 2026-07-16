from __future__ import annotations

from copy import deepcopy

import pytest
from pydantic import ValidationError

from src.optimization_models import OptimizationInput


def test_accepts_the_camel_cased_flat_search_space(optimization_payload: dict) -> None:
    parsed = OptimizationInput.model_validate(optimization_payload)

    assert parsed.scenario.parameter_values["rate"] == 0.5
    assert parsed.search_space.variables[0].identifier == "rate"
    assert parsed.model.as_legacy_file()["title"] == "Example"


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda payload: payload["scenario"].update(id="missing"),
            "selected scenario does not exist",
        ),
        (
            lambda payload: payload["objective"].update(metricId="missing"),
            "objective metric does not exist",
        ),
        (
            lambda payload: payload["scenario"]["parameterValues"].pop("count"),
            "values are required for every scenario parameter",
        ),
        (
            lambda payload: payload["searchSpace"]["variables"].append(
                deepcopy(payload["searchSpace"]["variables"][0])
            ),
            "identifiers must be unique",
        ),
    ],
)
def test_rejects_incoherent_model_references(
    optimization_payload: dict, mutate, message: str
) -> None:
    mutate(optimization_payload)

    with pytest.raises(ValidationError, match=message):
        OptimizationInput.model_validate(optimization_payload)


def test_enforces_parameter_specific_domains(optimization_payload: dict) -> None:
    optimization_payload["searchSpace"]["variables"] = [
        {
            "identifier": "enabled",
            "domain": {"kind": "categorical", "values": [False, 1]},
        },
        {
            "identifier": "share",
            "domain": {
                "kind": "continuous",
                "minimum": -1,
                "maximum": 2,
                "scale": "linear",
            },
        },
    ]

    with pytest.raises(ValidationError, match="boolean parameter"):
        OptimizationInput.model_validate(optimization_payload)


def test_requires_integer_step_to_land_on_maximum(
    optimization_payload: dict,
) -> None:
    optimization_payload["searchSpace"]["variables"] = [
        {
            "identifier": "count",
            "domain": {
                "kind": "integer",
                "minimum": 2,
                "maximum": 10,
                "step": 3,
            },
        }
    ]

    with pytest.raises(ValidationError, match="maximum is reachable"):
        OptimizationInput.model_validate(optimization_payload)


def test_rejects_nested_or_string_parameter_values(optimization_payload: dict) -> None:
    optimization_payload["scenario"]["parameterValues"]["rate"] = "0.5"

    with pytest.raises(ValidationError):
        OptimizationInput.model_validate(optimization_payload)


def test_categorical_uniqueness_uses_javascript_number_semantics(
    optimization_payload: dict,
) -> None:
    optimization_payload["searchSpace"]["variables"] = [
        {
            "identifier": "enabled",
            "domain": {"kind": "categorical", "values": [1, 1.0]},
        }
    ]

    with pytest.raises(ValidationError, match="categorical values must be unique"):
        OptimizationInput.model_validate(optimization_payload)


@pytest.mark.parametrize("seed", [-1, 2_147_483_648])
def test_rejects_seeds_outside_the_cli_range(
    optimization_payload: dict, seed: int
) -> None:
    optimization_payload["execution"]["seed"] = seed

    with pytest.raises(ValidationError):
        OptimizationInput.model_validate(optimization_payload)


def test_enforces_the_trial_cap(optimization_payload: dict) -> None:
    optimization_payload["optimization"]["trials"] = 1_001

    with pytest.raises(ValidationError):
        OptimizationInput.model_validate(optimization_payload)


def test_enforces_the_per_trial_step_cap(optimization_payload: dict) -> None:
    optimization_payload["execution"].update(dt=0.001, maxTime=100.001)

    with pytest.raises(ValidationError, match="100,000-step per-trial limit"):
        OptimizationInput.model_validate(optimization_payload)


def test_rejects_an_overflowing_step_count_as_validation(
    optimization_payload: dict,
) -> None:
    optimization_payload["execution"].update(dt=1e-300, maxTime=1e300)

    with pytest.raises(ValidationError, match="100,000-step per-trial limit"):
        OptimizationInput.model_validate(optimization_payload)


def test_enforces_the_aggregate_step_cap(optimization_payload: dict) -> None:
    optimization_payload["execution"].update(dt=0.001, maxTime=100)
    optimization_payload["optimization"]["trials"] = 51

    with pytest.raises(ValidationError, match="5,000,000-step aggregate limit"):
        OptimizationInput.model_validate(optimization_payload)


def test_accepts_the_workload_limit_boundary(optimization_payload: dict) -> None:
    optimization_payload["execution"].update(dt=0.001, maxTime=100)
    optimization_payload["optimization"]["trials"] = 50

    assert OptimizationInput.model_validate(optimization_payload)
