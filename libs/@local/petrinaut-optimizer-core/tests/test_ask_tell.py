from __future__ import annotations

import asyncio
import math
from collections.abc import Callable
from typing import Any

import pytest
from optuna.trial import TrialState

from petrinaut_optimizer_core import (
    create_study,
    objective_of,
    parse_description,
    run_study,
    suggest,
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

    def start(
        self, evaluate: Any = None, **options: Any
    ) -> asyncio.Task[dict[str, Any]]:
        return asyncio.ensure_future(
            run_study(
                self.study,
                self.description,
                evaluate=evaluate or self.evaluate,
                on_trial=self.events.append,
                is_cancelled=lambda: self.cancelled,
                **options,
            )
        )

    def run(self, evaluate: Any = None, **options: Any) -> dict[str, Any]:
        async def scenario() -> dict[str, Any]:
            return await self.start(evaluate, **options)

        return asyncio.run(scenario())


class ParallelHarness(Harness):
    """Evaluations settle only when the test says so, in the order it chooses."""

    def __init__(self, description: dict[str, Any]) -> None:
        super().__init__(description)
        self.pending: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self.asked_and_told_at_call: list[tuple[int, int]] = []
        self.interrupted: list[int] = []

    async def evaluate(self, values: dict[str, Any]) -> dict[str, Any]:
        index = len(self.evaluations)
        self.evaluations.append(values)
        self.asked_and_told_at_call.append(
            (len(self.study.get_trials(deepcopy=False)), len(self.events))
        )
        future: asyncio.Future[dict[str, Any]] = (
            asyncio.get_running_loop().create_future()
        )
        self.pending[index] = future
        try:
            return await future
        except asyncio.CancelledError:
            self.interrupted.append(index)
            raise

    def settle(self, index: int) -> None:
        self.pending.pop(index).set_result(
            {"objective": objective_of_values(self.evaluations[index])}
        )

    def fail(self, index: int, error: Exception) -> None:
        self.pending.pop(index).set_exception(error)


async def until(condition: Callable[[], bool]) -> None:
    for _ in range(1000):
        if condition():
            return
        await asyncio.sleep(0)
    raise AssertionError("the loop never reached the expected state")


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


def test_matches_a_plain_ask_tell_sequence(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["sampler"] = "tpe"
    optimization_description["study"]["trials"] = 12
    harness = Harness(optimization_description)
    harness.run()

    plain = create_study(harness.description)
    expected: list[dict[str, Any]] = []
    for _ in range(12):
        trial = plain.ask()
        values = suggest(trial, harness.description.parameters)
        plain.tell(trial, objective_of_values(values))
        expected.append(values)

    assert harness.evaluations == expected


def test_further_trials_continue_the_same_study(
    optimization_description: dict[str, Any],
) -> None:
    harness = Harness(optimization_description)

    first = harness.run(trials=2)
    second = harness.run(trials=3, requested_trials=5)

    assert [event["trial"] for event in harness.events] == [0, 1, 2, 3, 4]
    assert first["requestedTrials"] == 2
    assert first["completedTrials"] == 2
    assert second == {
        "requestedTrials": 5,
        "completedTrials": 5,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": harness.events[-1]["best"],
        "cancelled": False,
    }


def test_a_continued_tpe_study_keeps_its_sampler_history(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["sampler"] = "tpe"
    optimization_description["study"]["trials"] = 15
    continued = Harness(optimization_description)
    continued.run(trials=10)
    continued.run(trials=5, requested_trials=15)
    straight = Harness(optimization_description)
    straight.run()
    restarted = Harness(optimization_description)
    restarted.run(trials=5)

    assert continued.evaluations == straight.evaluations
    assert restarted.evaluations == straight.evaluations[:5]
    assert continued.evaluations[10:] != restarted.evaluations


def test_parallel_trials_are_asked_ahead_and_told_in_completion_order(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["trials"] = 5
    harness = ParallelHarness(optimization_description)

    async def scenario() -> dict[str, Any]:
        run = harness.start(parallelism=3)
        await until(lambda: len(harness.pending) == 3)
        harness.settle(1)
        harness.settle(2)
        await until(lambda: len(harness.events) == 2 and len(harness.pending) == 3)
        harness.settle(0)
        harness.settle(4)
        harness.settle(3)
        return await run

    summary = asyncio.run(scenario())

    assert harness.asked_and_told_at_call[:3] == [(3, 0), (3, 0), (3, 0)]
    assert [event["trial"] for event in harness.events] == [1, 2, 0, 4, 3]
    assert all(
        event["parameters"] == harness.evaluations[event["trial"]]
        for event in harness.events
    )
    assert summary["completedTrials"] == 5
    assert summary["requestedTrials"] == 5
    best = max(harness.events, key=lambda event: event["objective"])
    assert summary["best"]["trial"] == best["trial"]


def test_cancellation_waits_for_the_trials_in_flight_and_the_study_continues(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["trials"] = 6
    harness = ParallelHarness(optimization_description)

    async def scenario() -> tuple[dict[str, Any], bool, dict[str, Any]]:
        run = harness.start(parallelism=3)
        await until(lambda: len(harness.pending) == 3)
        harness.cancelled = True
        harness.settle(0)
        for _ in range(20):
            await asyncio.sleep(0)
        settled_early = run.done()
        harness.settle(1)
        harness.settle(2)
        stopped = await run
        harness.cancelled = False
        resumed_run = harness.start(trials=2, requested_trials=5)
        await until(lambda: 3 in harness.pending)
        harness.settle(3)
        await until(lambda: 4 in harness.pending)
        harness.settle(4)
        return stopped, settled_early, await resumed_run

    stopped, settled_early, resumed = asyncio.run(scenario())

    assert settled_early is False
    assert stopped["cancelled"] is True
    assert stopped["completedTrials"] == 0
    assert stopped["failedTrials"] == 3
    assert harness.interrupted == []
    assert [event["trial"] for event in harness.events] == [3, 4]
    assert resumed["completedTrials"] == 2
    assert resumed["failedTrials"] == 3
    assert resumed["requestedTrials"] == 5
    assert resumed["cancelled"] is False
    assert [trial.state for trial in harness.study.get_trials(deepcopy=False)] == [
        TrialState.FAIL
    ] * 3 + [TrialState.COMPLETE] * 2


def test_an_evaluation_error_cancels_the_trials_in_flight(
    optimization_description: dict[str, Any],
) -> None:
    harness = ParallelHarness(optimization_description)

    async def scenario() -> dict[str, Any]:
        run = harness.start(parallelism=3)
        await until(lambda: len(harness.pending) == 3)
        harness.fail(1, RuntimeError("worker crashed"))
        return await run

    with pytest.raises(RuntimeError, match="worker crashed"):
        asyncio.run(scenario())

    assert sorted(harness.interrupted) == [0, 2]
    assert harness.events == []


@pytest.mark.parametrize("options", [{"trials": 0}, {"parallelism": 0}])
def test_rejects_a_run_without_trials_or_parallelism(
    optimization_description: dict[str, Any],
    options: dict[str, int],
) -> None:
    with pytest.raises(ValueError, match="at least 1"):
        Harness(optimization_description).run(**options)


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


def test_cancellation_after_an_evaluate_fails_the_trial_without_an_event(
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
    assert summary["failedTrials"] == 1
    assert summary["cancelled"] is True
    assert [trial.state for trial in harness.study.get_trials(deepcopy=False)] == [
        TrialState.FAIL
    ]


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
