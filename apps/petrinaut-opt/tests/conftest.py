from __future__ import annotations

import pytest


@pytest.fixture
def optimization_manifest() -> dict:
    """The Python service deliberately treats this document as opaque JSON."""
    return {
        "kind": "petrinaut-optimization",
        "version": 1,
        "model": {
            "title": "Example",
            "definition": {
                "scenarios": [{"id": "baseline"}],
                "metrics": [{"id": "profit", "code": "return 1;"}],
            },
        },
        "scenario": {
            "id": "baseline",
            "parameterBindings": {
                "rate": {
                    "kind": "optimize",
                    "minimum": 0.1,
                    "maximum": 2.0,
                    "scale": "log",
                },
                "capacity": {"kind": "fixed", "value": 100},
            },
        },
        "objective": {"metricId": "profit", "direction": "maximize"},
    }


@pytest.fixture
def optimization_description() -> dict:
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
