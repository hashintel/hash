"""End-to-end tests against the real built CLI bundle.

These spawn `node dist/cli.js`, so they need the CLI built and `node` on the
path. `turbo run test:unit --filter @local/petrinaut-python` builds the bundle
through the workspace dependency; plain `uv run pytest` skips these tests when
the bundle or `node` is missing.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import pytest

from petrinaut import (
    OptimizationFloatParameter,
    OptimizationIntParameter,
    OptimizationSession,
    PetrinautSession,
)

REPO_LIBS = Path(__file__).resolve().parents[3]
CLI_BUNDLE = REPO_LIBS / "@hashintel/petrinaut-cli/dist/cli.js"
CLI_FIXTURES = REPO_LIBS / "@hashintel/petrinaut-cli/test-fixtures"
SIR_MODEL = CLI_FIXTURES / "sir-model.json"
SUPPLY_CHAIN_OPTIMIZATION = CLI_FIXTURES / "supply-chain-profit-optimization.json"
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(
    not CLI_BUNDLE.exists() or NODE is None,
    reason="requires the built Petrinaut CLI bundle and node",
)


def test_runs_the_sir_model_end_to_end() -> None:
    request = {
        "parameters": {"infection_rate": 1.5, "recovery_rate": 0.8},
        "initialState": {
            "Susceptible": 990,
            "Infected": 10,
            "Recovered": 0,
        },
        "metrics": ["Infected Fraction"],
        "maxSteps": 50,
        "dt": 0.1,
        "seed": 4242,
    }
    with PetrinautSession.from_model_file(
        SIR_MODEL,
        command=(str(NODE), str(CLI_BUNDLE)),
    ) as session:
        assert session.healthz() == {"ok": True}

        metadata = session.metadata()
        metric_names = {metric["name"] for metric in metadata["metrics"]}
        assert "Infected Fraction" in metric_names

        result = session.run(request)
        assert result["status"] == "complete"
        assert result["seed"] == 4242
        assert 0 <= result["metrics"]["Infected Fraction"] <= 1

        # The same seed reproduces the same trajectory.
        repeat = session.run(request)
        assert repeat["metrics"] == result["metrics"]


def test_evaluates_an_optimization_manifest_end_to_end() -> None:
    with OptimizationSession(
        manifest_path=SUPPLY_CHAIN_OPTIMIZATION,
        command=(str(NODE), str(CLI_BUNDLE)),
    ) as session:
        description = session.describe()
        assert description.direction.value == "maximize"

        parameters = {
            parameter.identifier: parameter for parameter in description.parameters
        }
        production_rate = parameters["production_rate"]
        assert isinstance(production_rate, OptimizationFloatParameter)
        assert production_rate.minimum == 20
        assert production_rate.maximum == 250
        assert isinstance(parameters["reorder_threshold"], OptimizationIntParameter)

        result = session.evaluate(
            {
                "production_rate": 100,
                "reorder_threshold": 120,
                "batch_size": 180,
                "selling_price": 34,
                "expedite_fraction": 0.25,
                "marketing_spend": 40,
            }
        )
        assert math.isfinite(result.objective)


def test_runs_a_seeded_optimization_study_end_to_end() -> None:
    """Evaluates one trial as two sequential seeded runs on the real CLI."""
    legacy_model = json.loads(SIR_MODEL.read_text())
    definition = {key: value for key, value in legacy_model.items() if key != "title"}
    manifest = {
        "kind": "petrinaut-optimization",
        "version": 1,
        "name": "Minimize infected fraction",
        "model": {
            "title": legacy_model["title"],
            "definition": {
                **definition,
                "scenarios": [legacy_model["scenarios"][0]],
                "metrics": [legacy_model["metrics"][0]],
            },
        },
        "scenario": {
            "id": "scenario__seasonal_flu",
            "parameterBindings": {
                "population": {"kind": "fixed", "value": 200},
                "infected_ratio": {
                    "kind": "optimize",
                    "domain": {
                        "kind": "continuous",
                        "minimum": 0.01,
                        "maximum": 0.5,
                        "scale": "log",
                    },
                },
            },
        },
        "objective": {
            "metricId": "metric__infected_fraction",
            "direction": "minimize",
        },
        "execution": {"seed": 42, "dt": 1, "maxTime": 5e-324, "seedsPerTrial": 2},
        "study": {"trials": 20, "sampler": "tpe"},
    }
    with OptimizationSession(manifest, command=(str(NODE), str(CLI_BUNDLE))) as session:
        description = session.describe()
        assert description.study.seedsPerTrial == 2
        assert session._request_timeout_seconds == 480

        result = session.evaluate({"infected_ratio": 0.1})
        assert result.objective == pytest.approx(0.1)
        assert result.replicates is not None
        assert [replicate.seed for replicate in result.replicates] == [
            42,
            1013904268,
        ]
        assert session.objective({"infected_ratio": 0.1}) == pytest.approx(0.1)
