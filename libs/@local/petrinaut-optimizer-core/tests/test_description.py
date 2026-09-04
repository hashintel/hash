from __future__ import annotations

import json
from typing import Any

import pytest

from petrinaut_optimizer_core import (
    MAX_STUDY_TRIALS,
    BooleanParameter,
    FloatParameter,
    IntParameter,
    parse_description,
)


def test_parses_the_describe_result_into_plain_dataclasses(
    optimization_description: dict[str, Any],
) -> None:
    description = parse_description(optimization_description)

    assert description.direction == "maximize"
    assert description.sampler == "random"
    assert description.trials == 3
    assert description.seed == 42
    assert description.seeds_per_trial == 1
    assert description.parameters == (
        FloatParameter("rate", minimum=0.1, maximum=2.0, log=True),
        IntParameter("count", minimum=2, maximum=8, step=2, log=False),
        BooleanParameter("enabled"),
    )


def test_reads_seeds_per_trial_when_reported(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["seedsPerTrial"] = 5

    assert parse_description(optimization_description).seeds_per_trial == 5


def test_accepts_the_result_after_a_json_round_trip(
    optimization_description: dict[str, Any],
) -> None:
    round_tripped = json.loads(json.dumps(optimization_description))

    assert parse_description(round_tripped) == parse_description(
        optimization_description
    )


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"direction": "up"}, "unsupported optimization direction: 'up'"),
        (
            {"study": {"trials": 0, "sampler": "random", "seed": 42}},
            "study.trials must be at least 1",
        ),
        (
            {
                "study": {
                    "trials": MAX_STUDY_TRIALS + 1,
                    "sampler": "random",
                    "seed": 42,
                }
            },
            f"study.trials must not exceed {MAX_STUDY_TRIALS}",
        ),
        (
            {"study": {"trials": 1, "sampler": "unknown", "seed": 42}},
            "unsupported Optuna sampler: 'unknown'",
        ),
        (
            {"study": {"trials": 1, "sampler": "random", "seed": -1}},
            "study.seed must be a non-negative integer",
        ),
        (
            {
                "study": {
                    "trials": 1,
                    "sampler": "random",
                    "seed": 1,
                    "seedsPerTrial": 0,
                }
            },
            "study.seedsPerTrial must be between 1 and 100",
        ),
        (
            {"study": {"trials": 1.5, "sampler": "random", "seed": 1}},
            "study.trials must be an integer",
        ),
        (
            {
                "parameters": [
                    {"identifier": "rate", "type": "boolean", "default": True},
                    {"identifier": "rate", "type": "boolean", "default": False},
                ]
            },
            'duplicate optimization parameter "rate"',
        ),
        (
            {
                "parameters": [
                    {
                        "identifier": "rate",
                        "type": "float",
                        "default": 1,
                        "minimum": 0,
                        "maximum": float("inf"),
                        "scale": "linear",
                    }
                ]
            },
            "rate bounds must be finite numbers",
        ),
        (
            {
                "parameters": [
                    {
                        "identifier": "rate",
                        "type": "float",
                        "default": 1,
                        "minimum": 1,
                        "maximum": 1,
                        "scale": "linear",
                    }
                ]
            },
            "rate.maximum must exceed minimum",
        ),
        (
            {
                "parameters": [
                    {
                        "identifier": "rate",
                        "type": "float",
                        "default": 1,
                        "minimum": 0,
                        "maximum": 1,
                        "scale": "log",
                    }
                ]
            },
            "rate.minimum must be positive for log scale",
        ),
        (
            {
                "parameters": [
                    {
                        "identifier": "count",
                        "type": "int",
                        "default": 1,
                        "minimum": 1,
                        "maximum": 10,
                        "step": 2,
                        "scale": "log",
                    }
                ]
            },
            "count.step must be 1 for log scale",
        ),
        (
            {
                "parameters": [
                    {
                        "identifier": "count",
                        "type": "int",
                        "default": 1,
                        "minimum": 1.5,
                        "maximum": 10,
                        "step": 1,
                        "scale": "linear",
                    }
                ]
            },
            "count.minimum must be an integer",
        ),
        (
            {"parameters": [{"identifier": "rate", "type": "string"}]},
            "unsupported optimization parameter type: 'string'",
        ),
        ({"parameters": {"rate": {}}}, "parameters must be an array"),
        ({"study": None}, "study must be an object"),
    ],
)
def test_rejects_descriptions_that_break_a_rule(
    optimization_description: dict[str, Any],
    change: dict[str, Any],
    message: str,
) -> None:
    optimization_description.update(change)

    with pytest.raises(ValueError, match=message):
        parse_description(optimization_description)
