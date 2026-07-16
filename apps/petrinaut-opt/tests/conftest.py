from __future__ import annotations

import pytest


@pytest.fixture
def optimization_payload() -> dict:
    return {
        "name": "Find the best rate",
        "model": {
            "title": "Example",
            "definition": {
                "places": [],
                "transitions": [],
                "types": [],
                "differentialEquations": [],
                "parameters": [],
                "subnets": [],
                "componentInstances": [],
                "scenarios": [
                    {
                        "id": "baseline",
                        "name": "Baseline",
                        "scenarioParameters": [
                            {"identifier": "rate", "type": "real", "default": 0.5},
                            {"identifier": "count", "type": "integer", "default": 10},
                            {"identifier": "enabled", "type": "boolean", "default": 1},
                            {"identifier": "share", "type": "ratio", "default": 0.25},
                        ],
                        "parameterOverrides": {},
                        "initialState": {"type": "per_place", "content": {}},
                    }
                ],
                "metrics": [
                    {"id": "profit", "name": "Profit", "code": "return 1;"}
                ],
            },
        },
        "scenario": {
            "id": "baseline",
            "parameterValues": {
                "rate": 0.5,
                "count": 10,
                "enabled": True,
                "share": 0.25,
            },
        },
        "searchSpace": {
            "version": 1,
            "variables": [
                {
                    "identifier": "rate",
                    "domain": {
                        "kind": "continuous",
                        "minimum": 0.1,
                        "maximum": 2,
                        "scale": "linear",
                    },
                }
            ],
        },
        "objective": {"metricId": "profit", "direction": "maximize"},
        "execution": {"seed": 42, "dt": 0.1, "maxTime": 100},
        "optimization": {"trials": 3, "sampler": "random"},
    }
