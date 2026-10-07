import pytest


@pytest.fixture
def optimization_description() -> dict[str, object]:
    return {
        "direction": "maximize",
        "study": {"trials": 3, "sampler": "random", "seed": 42},
        "parameters": [
            {
                "identifier": "rate",
                "type": "float",
                "default": 0.5,
                "minimum": 0.1,
                "maximum": 2.0,
                "scale": "log",
            },
            {
                "identifier": "count",
                "type": "int",
                "default": 4,
                "minimum": 2,
                "maximum": 8,
                "step": 2,
                "scale": "linear",
            },
            {
                "identifier": "enabled",
                "type": "boolean",
                "default": True,
            },
        ],
    }
