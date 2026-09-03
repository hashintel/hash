from __future__ import annotations

import asyncio
import math
from typing import Any

import pytest

from petrinaut_optimizer_core import (
    create_study,
    objective_of,
    parse_description,
    run_study,
)

from .conftest import objective_of_values


class Harness:
    def __init__(self, description: dict[str, Any]) -> None:
        self.description = parse_description(description)
        self.study = create_study(self.description)
        self.evaluations: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.cancelled = False

    async def evaluate(self, values: dict[str, Any]) -> dict[str, Any]:
        self.evaluations.append(values)
        return {"objective": objective_of_values(values)}

    def run(self, evaluate: Any = None) -> dict[str, Any]:
        return asyncio.run(
            run_study(
                self.study,
                self.description,
                evaluate=evaluate or self.evaluate,
                on_trial=self.events.append,
                is_cancelled=lambda: self.cancelled,
            )
        )


def test_tells_each_objective_and_reports_every_trial(
    optimization_description: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)

    summary = harness.run()

    assert len(harness.evaluations) == 3
    assert [event["trial"] for event in harness.events] == [0, 1, 2]
    assert all(
        set(event) == {"trial", "parameters", "objective", "state", "best"}
        for event in harness.events
    )
    assert [event["parameters"] for event in harness.events] == harness.evaluations
    assert [event["objective"] for event in harness.events] == [
        objective_of_values(values) for values in harness.evaluations
    ]
    assert all(event["state"] == "complete" for event in harness.events)
    best_objective = max(event["objective"] for event in harness.events)
    assert harness.events[-1]["best"]["objective"] == best_objective
    assert summary == {
        "requestedTrials": 3,
        "completedTrials": 3,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": harness.events[-1]["best"],
        "cancelled": False,
    }


@pytest.mark.parametrize(
    "pruned_outcome",
    [{"pruned": "simulation failed"}, {"kind": "pruned", "reason": "cancelled"}],
)
def test_records_pruned_outcomes_without_an_objective(
    optimization_description: dict[str, Any],
    pruned_outcome: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)

    async def evaluate(values: dict[str, Any]) -> dict[str, Any]:
        if len(harness.evaluations) == 1:
            harness.evaluations.append(values)
            return pruned_outcome
        return await harness.evaluate(values)

    summary = harness.run(evaluate)

    assert [event["state"] for event in harness.events] == [
        "complete",
        "pruned",
        "complete",
    ]
    assert harness.events[1]["objective"] is None
    assert harness.events[1]["best"]["trial"] == 0
    assert summary["completedTrials"] == 2
    assert summary["prunedTrials"] == 1


def test_accepts_the_channel_tagged_objective_form(
    optimization_description: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)

    async def evaluate(values: dict[str, Any]) -> dict[str, Any]:
        return {
            "kind": "objective",
            "objective": objective_of_values(values),
            "replicates": [],
        }

    assert harness.run(evaluate)["completedTrials"] == 3


@pytest.mark.parametrize(
    "outcome",
    [
        {"objective": math.inf},
        {"objective": math.nan},
        {"objective": "3"},
        {"objective": True},
        {"objective": None},
        {},
    ],
)
def test_rejects_outcomes_without_a_finite_objective(outcome: dict[str, Any]) -> None:
    with pytest.raises(ValueError, match="finite number"):
        objective_of(outcome)


def test_a_non_finite_objective_ends_the_study(
    optimization_description: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)

    async def evaluate(_values: dict[str, Any]) -> dict[str, Any]:
        return {"objective": math.inf}

    with pytest.raises(ValueError, match="finite number"):
        harness.run(evaluate)

    assert harness.events == []


def test_evaluation_errors_propagate(
    optimization_description: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)

    async def evaluate(_values: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("worker crashed")

    with pytest.raises(RuntimeError, match="worker crashed"):
        harness.run(evaluate)


def test_cancellation_after_an_evaluate_leaves_the_trial_untold(
    optimization_description: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)

    async def evaluate(values: dict[str, Any]) -> dict[str, Any]:
        outcome = await harness.evaluate(values)
        harness.cancelled = len(harness.evaluations) == 1
        return outcome

    summary = harness.run(evaluate)

    assert len(harness.evaluations) == 1
    assert harness.events == []
    assert summary["completedTrials"] == 0
    assert summary["cancelled"] is True


def test_cancellation_between_trials_keeps_the_told_trials(
    optimization_description: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)
    original_append = harness.events.append

    def on_trial(event: dict[str, Any]) -> None:
        original_append(event)
        harness.cancelled = True

    summary = asyncio.run(
        run_study(
            harness.study,
            harness.description,
            evaluate=harness.evaluate,
            on_trial=on_trial,
            is_cancelled=lambda: harness.cancelled,
        )
    )

    assert len(harness.evaluations) == 1
    assert len(harness.events) == 1
    assert summary["completedTrials"] == 1
    assert summary["best"] == harness.events[0]["best"]
    assert summary["cancelled"] is True
