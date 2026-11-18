import pytest

from petrinaut_optimizer_core import (
    MAX_STUDY_TRIALS,
    BooleanParameter,
    FloatParameter,
    IntParameter,
    parse_description,
)

from ._support import OptimizationDescription


def test_description_fields(
    optimization_description: OptimizationDescription,
) -> None:
    description = parse_description(optimization_description)

    assert description.direction == "maximize"
    assert description.sampler == "random"
    assert description.trials == 3
    assert description.seed == 42
    assert description.parameters == (
        FloatParameter("rate", minimum=0.1, maximum=2.0, log=True),
        IntParameter("count", minimum=2, maximum=8, step=2, log=False),
        BooleanParameter("enabled"),
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
            {"parameters": [{"identifier": "rate", "type": "string"}]},
            "unsupported optimization parameter type: 'string'",
        ),
    ],
)
def test_description_invalid(
    optimization_description: OptimizationDescription,
    change: dict[str, object],
    message: str,
) -> None:
    changed_description: dict[str, object] = dict(optimization_description)
    changed_description.update(change)

    with pytest.raises(ValueError, match=message):
        parse_description(changed_description)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"direction": 1}, "unsupported optimization direction"),
        ({"study": None}, "study must be an object"),
        ({"study": {"trials": 1.5}}, "study.trials must be an integer"),
        ({"study": {"seed": True}}, "study.seed must be an integer"),
        ({"parameters": {}}, "parameters must be an array"),
        (
            {"parameters": [{"identifier": 1, "type": "boolean"}]},
            "identifier must be a string",
        ),
        (
            {"parameters": [{"identifier": "rate", "type": None}]},
            "unsupported optimization parameter type",
        ),
        (
            {"parameters": [{"identifier": "rate", "type": "float", "minimum": True}]},
            "rate.minimum must be a number",
        ),
    ],
)
def test_description_field_types(
    optimization_description: OptimizationDescription,
    change: dict[str, object],
    message: str,
) -> None:
    changed_description: dict[str, object] = dict(optimization_description)
    study_change = change.get("study")
    if isinstance(study_change, dict):
        changed_description["study"] = {**optimization_description["study"], **study_change}
        change = {key: value for key, value in change.items() if key != "study"}
    changed_description.update(change)

    with pytest.raises(TypeError, match=message):
        parse_description(changed_description)
