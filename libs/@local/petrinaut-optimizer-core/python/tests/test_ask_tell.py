import asyncio
import math
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import override

import pytest
from optuna.trial import BaseTrial, TrialState

from petrinaut_optimizer_core import (
    ask_tell,
    create_study,
    parse_description,
    run_study,
    suggest,
)
from petrinaut_optimizer_core.ask_tell import (
    UNREPORTED_ATTR,
    Evaluate,
    best_summary,
    objective_of,
    study_summary,
    told_trials,
    trial_event,
)
from petrinaut_optimizer_core.description import Parameter
from petrinaut_optimizer_core.reports import RunSummary, TrialEvent
from petrinaut_optimizer_core.study import Scalar

from ._support import OptimizationDescription, completed, objective_of_values


class Harness:
    def __init__(self, description: OptimizationDescription) -> None:
        self.description = parse_description(description)
        self.study = create_study(self.description)
        self.evaluations: list[dict[str, Scalar]] = []
        self.events: list[TrialEvent] = []
        self.cancelled = False

    def evaluate(self, values: dict[str, Scalar]) -> Awaitable[dict[str, float]]:
        self.evaluations.append(values)
        return completed({"objective": objective_of_values(values)})

    def start(
        self, evaluate: Evaluate | None = None, *, trials: int | None = None, parallelism: int = 1
    ) -> asyncio.Task[RunSummary]:
        trials = self.description.trials if trials is None else trials
        return asyncio.ensure_future(
            run_study(
                self.study,
                self.description,
                evaluate=evaluate or self.evaluate,
                on_trial=self.events.append,
                is_cancelled=lambda: self.cancelled,
                trials=trials,
                parallelism=parallelism,
            )
        )


class PausableHarness(Harness):
    def __init__(self, description: OptimizationDescription) -> None:
        super().__init__(description)
        self.paused = False

    @override
    def start(
        self, evaluate: Evaluate | None = None, *, trials: int | None = None, parallelism: int = 1
    ) -> asyncio.Task[RunSummary]:
        trials = self.description.trials if trials is None else trials
        return asyncio.ensure_future(
            run_study(
                self.study,
                self.description,
                evaluate=evaluate or self.evaluate,
                on_trial=self.events.append,
                is_cancelled=lambda: self.cancelled,
                is_paused=lambda: self.paused,
                trials=trials,
                parallelism=parallelism,
            )
        )


class ParallelHarness(PausableHarness):
    """Evaluations settle only when the test says so, in the order it chooses."""

    def __init__(self, description: OptimizationDescription) -> None:
        super().__init__(description)
        self.pending: dict[int, asyncio.Future[dict[str, float]]] = {}
        self.asked_and_told_at_call: list[tuple[int, int]] = []
        self.interrupted: list[int] = []

    @override
    async def evaluate(self, values: dict[str, Scalar]) -> dict[str, float]:
        index = len(self.evaluations)
        self.evaluations.append(values)
        self.asked_and_told_at_call.append((
            len(self.study.get_trials(deepcopy=False)),
            len(self.events),
        ))
        future: asyncio.Future[dict[str, float]] = asyncio.get_running_loop().create_future()
        self.pending[index] = future
        try:
            return await future
        except asyncio.CancelledError:
            self.interrupted.append(index)
            raise

    def settle(self, index: int) -> None:
        self.pending.pop(index).set_result({
            "objective": objective_of_values(self.evaluations[index])
        })

    def fail(self, index: int, error: Exception) -> None:
        self.pending.pop(index).set_exception(error)


async def until(condition: Callable[[], bool]) -> None:
    for _ in range(1000):
        if condition():
            return
        await asyncio.sleep(0)
    raise AssertionError("the loop never reached the expected state")


def complete_objective(event: TrialEvent) -> float:
    objective = event["objective"]
    assert objective is not None
    return objective


@pytest.mark.asyncio
async def test_run_reports(
    optimization_description: OptimizationDescription,
) -> None:
    harness = Harness(optimization_description)

    summary = await harness.start()

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
    assert all(event["objective"] is not None for event in harness.events)
    best_objective = max(complete_objective(event) for event in harness.events)
    assert harness.events[-1]["best"] is not None
    assert harness.events[-1]["best"]["objective"] == best_objective
    assert summary == {
        "completedTrials": 3,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": harness.events[-1]["best"],
        "cancelled": False,
        "paused": False,
    }


@pytest.mark.asyncio
async def test_run_plain_sequence(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["sampler"] = "tpe"
    optimization_description["study"]["trials"] = 12
    harness = Harness(optimization_description)
    await harness.start()

    plain = create_study(harness.description)
    expected: list[dict[str, Scalar]] = []
    for _ in range(12):
        trial = plain.ask()
        values = suggest(trial, harness.description.parameters)
        plain.tell(trial, objective_of_values(values))
        expected.append(values)

    assert harness.evaluations == expected


@pytest.mark.asyncio
async def test_run_continued(
    optimization_description: OptimizationDescription,
) -> None:
    harness = Harness(optimization_description)

    first = await harness.start(trials=2)
    second = await harness.start(trials=3)

    assert [event["trial"] for event in harness.events] == [0, 1, 2, 3, 4]
    assert first["completedTrials"] == 2
    assert second == {
        "completedTrials": 5,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": harness.events[-1]["best"],
        "cancelled": False,
        "paused": False,
    }


@pytest.mark.asyncio
async def test_run_sampler_history(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["sampler"] = "tpe"
    optimization_description["study"]["trials"] = 15
    continued = Harness(optimization_description)
    await continued.start(trials=10)
    await continued.start(trials=5)
    straight = Harness(optimization_description)
    await straight.start()
    restarted = Harness(optimization_description)
    await restarted.start(trials=5)

    assert continued.evaluations == straight.evaluations
    assert restarted.evaluations == straight.evaluations[:5]
    assert continued.evaluations[10:] != restarted.evaluations


@pytest.mark.asyncio
async def test_parallel_completion_order(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["trials"] = 5
    harness = ParallelHarness(optimization_description)

    run = harness.start(parallelism=3)
    await until(lambda: len(harness.pending) == 3)
    harness.settle(1)
    harness.settle(2)
    await until(lambda: len(harness.events) == 2 and len(harness.pending) == 3)
    harness.settle(0)
    harness.settle(4)
    harness.settle(3)
    summary = await run

    assert harness.asked_and_told_at_call[:3] == [(3, 0), (3, 0), (3, 0)]
    assert [event["trial"] for event in harness.events] == [1, 2, 0, 4, 3]
    assert all(
        event["parameters"] == harness.evaluations[event["trial"]] for event in harness.events
    )
    assert summary["completedTrials"] == 5
    best = max(harness.events, key=complete_objective)
    assert summary["best"] is not None
    assert summary["best"]["trial"] == best["trial"]


@pytest.mark.asyncio
async def test_cancel_drains_and_continues(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["trials"] = 6
    harness = ParallelHarness(optimization_description)

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
    resumed_run = harness.start(trials=2)
    await until(lambda: 3 in harness.pending)
    harness.settle(3)
    await until(lambda: 4 in harness.pending)
    harness.settle(4)
    resumed = await resumed_run

    assert settled_early is False
    assert stopped["cancelled"] is True
    assert stopped["completedTrials"] == 0
    assert stopped["failedTrials"] == 0
    assert harness.interrupted == []
    assert [event["trial"] for event in harness.events] == [3, 4]
    assert resumed["completedTrials"] == 2
    assert resumed["failedTrials"] == 0
    assert resumed["cancelled"] is False
    assert [trial.state for trial in harness.study.get_trials(deepcopy=False)] == [
        TrialState.FAIL
    ] * 3 + [TrialState.COMPLETE] * 2
    # The stopped trials never produced an event, so the counters skip them
    # and add up to the trials the loop reported.
    assert resumed["completedTrials"] + resumed["prunedTrials"] + resumed[
        "failedTrials"
    ] == told_trials(harness.study)


@pytest.mark.asyncio
async def test_pause_drains_and_continues(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["trials"] = 6
    harness = ParallelHarness(optimization_description)

    run = harness.start(parallelism=2)
    await until(lambda: len(harness.pending) == 2)
    harness.paused = True
    harness.settle(0)
    for _ in range(20):
        await asyncio.sleep(0)
    # Trial 1 is still in flight, so the run waits; no third trial is asked.
    settled_early = run.done()
    assert len(harness.evaluations) == 2
    harness.settle(1)
    paused = await run
    harness.paused = False
    resumed_run = harness.start(trials=4, parallelism=2)
    await until(lambda: {2, 3} <= set(harness.pending))
    for index in (2, 3):
        harness.settle(index)
    await until(lambda: {4, 5} <= set(harness.pending))
    for index in (4, 5):
        harness.settle(index)
    resumed = await resumed_run

    assert settled_early is False
    assert paused["paused"] is True
    assert paused["cancelled"] is False
    assert paused["completedTrials"] == 2
    assert paused["failedTrials"] == 0
    assert harness.interrupted == []
    # Both trials in flight at the pause were told and reported; the
    # continuation numbers on from them.
    assert [event["trial"] for event in harness.events] == [0, 1, 2, 3, 4, 5]
    assert resumed["paused"] is False
    assert resumed["completedTrials"] == 6
    assert [trial.state for trial in harness.study.get_trials(deepcopy=False)] == [
        TrialState.COMPLETE
    ] * 6


@pytest.mark.asyncio
async def test_pause_last_ask(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["trials"] = 2
    harness = ParallelHarness(optimization_description)

    run = harness.start(parallelism=2)
    await until(lambda: len(harness.pending) == 2)
    harness.paused = True
    harness.settle(0)
    harness.settle(1)
    summary = await run

    assert summary["paused"] is False
    assert summary["completedTrials"] == 2
    assert [event["trial"] for event in harness.events] == [0, 1]


@pytest.mark.asyncio
async def test_pause_before_ask(
    optimization_description: OptimizationDescription,
) -> None:
    harness = PausableHarness(optimization_description)
    harness.paused = True

    summary = await harness.start()

    assert summary["paused"] is True
    assert harness.evaluations == []
    assert harness.events == []
    assert harness.study.get_trials(deepcopy=False) == []


@pytest.mark.asyncio
async def test_evaluate_error_cancels_peers(
    optimization_description: OptimizationDescription,
) -> None:
    harness = ParallelHarness(optimization_description)

    run = harness.start(parallelism=3)
    await until(lambda: len(harness.pending) == 3)
    harness.fail(1, RuntimeError("worker crashed"))

    with pytest.raises(RuntimeError, match="worker crashed"):
        await run

    assert sorted(harness.interrupted) == [0, 2]
    assert harness.events == []
    assert [trial.state for trial in harness.study.get_trials(deepcopy=False)] == [
        TrialState.FAIL
    ] * 3, "every asked trial is told failed, none stays running"


@pytest.mark.parametrize("options", [{"trials": 0}, {"parallelism": 0}])
@pytest.mark.asyncio
async def test_run_invalid_limits(
    optimization_description: OptimizationDescription,
    options: dict[str, int],
) -> None:
    with pytest.raises(ValueError, match="at least 1"):
        await Harness(optimization_description).start(
            trials=options.get("trials"), parallelism=options.get("parallelism", 1)
        )


@pytest.mark.asyncio
async def test_run_pruned(
    optimization_description: OptimizationDescription,
) -> None:
    harness = Harness(optimization_description)

    async def evaluate(values: dict[str, Scalar]) -> Mapping[str, object]:
        if len(harness.evaluations) == 1:
            harness.evaluations.append(values)
            return {"pruned": "simulation failed"}
        return await harness.evaluate(values)

    summary = await harness.start(evaluate)

    assert [event["state"] for event in harness.events] == [
        "complete",
        "pruned",
        "complete",
    ]
    assert harness.events[1]["objective"] is None
    assert harness.events[1]["best"] is not None
    assert harness.events[1]["best"]["trial"] == 0
    assert summary["completedTrials"] == 2
    assert summary["prunedTrials"] == 1


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
def test_objective_invalid(outcome: dict[str, object]) -> None:
    with pytest.raises(ValueError, match="finite number"):
        objective_of(outcome)


@pytest.mark.asyncio
async def test_objective_error_fails_trial(
    optimization_description: OptimizationDescription,
) -> None:
    harness = Harness(optimization_description)

    def evaluate(_values: dict[str, Scalar]) -> asyncio.Future[dict[str, float]]:
        return completed({"objective": math.inf})

    with pytest.raises(ValueError, match="finite number"):
        await harness.start(evaluate)

    assert harness.events == []
    assert [trial.state for trial in harness.study.get_trials(deepcopy=False)] == [
        TrialState.FAIL
    ], "the rejected trial is told failed, not left running"


@pytest.mark.asyncio
async def test_cancel_after_evaluate(
    optimization_description: OptimizationDescription,
) -> None:
    harness = Harness(optimization_description)

    async def evaluate(values: dict[str, Scalar]) -> dict[str, float]:
        outcome = await harness.evaluate(values)
        harness.cancelled = len(harness.evaluations) == 1
        return outcome

    summary = await harness.start(evaluate)

    assert len(harness.evaluations) == 1
    assert harness.events == []
    assert summary["completedTrials"] == 0
    assert summary["failedTrials"] == 0
    assert summary["cancelled"] is True
    (failed,) = harness.study.get_trials(deepcopy=False)
    assert failed.state == TrialState.FAIL
    assert failed.user_attrs == {UNREPORTED_ATTR: True}


@pytest.mark.asyncio
async def test_cancel_after_report(
    optimization_description: OptimizationDescription,
) -> None:
    harness = Harness(optimization_description)
    original_append = harness.events.append

    def on_trial(event: TrialEvent) -> None:
        original_append(event)
        harness.cancelled = True

    summary = await run_study(
        harness.study,
        harness.description,
        trials=harness.description.trials,
        evaluate=harness.evaluate,
        on_trial=on_trial,
        is_cancelled=lambda: harness.cancelled,
    )

    assert len(harness.evaluations) == 1
    assert len(harness.events) == 1
    assert summary["completedTrials"] == 1
    assert summary["best"] == harness.events[0]["best"]
    assert summary["cancelled"] is True


def test_told_trials_reported(
    optimization_description: OptimizationDescription,
) -> None:
    description = parse_description(optimization_description)
    study = create_study(description)

    first = study.ask()
    suggest(first, description.parameters)
    study.tell(first, 1.5)
    second = study.ask()
    suggest(second, description.parameters)
    study.tell(second, state=TrialState.PRUNED)
    third = study.ask()
    suggest(third, description.parameters)
    study.tell(third, state=TrialState.FAIL)
    suggest(study.ask(), description.parameters)

    assert told_trials(study) == 2


def test_reports_best_and_states(
    optimization_description: OptimizationDescription,
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
    assert second_event["best"] is not None
    assert second_event["best"]["trial"] == 0
    assert third_event["best"] == {
        "trial": 2,
        "parameters": dict(third.params),
        "objective": 4.0,
    }
    assert study_summary(study) == {
        "completedTrials": 2,
        "prunedTrials": 1,
        "failedTrials": 0,
        "best": third_event["best"],
    }

    # A failure the loop reported counts; one it marked unreported does not.
    fourth = study.ask()
    suggest(fourth, description.parameters)
    study.tell(fourth, state=TrialState.FAIL)
    fifth = study.ask()
    suggest(fifth, description.parameters)
    unreported = True
    fifth.set_user_attr(UNREPORTED_ATTR, unreported)
    study.tell(fifth, state=TrialState.FAIL)
    assert study_summary(study)["failedTrials"] == 1


@pytest.mark.asyncio
async def test_report_error_cancels_peers(
    optimization_description: OptimizationDescription,
) -> None:
    harness = ParallelHarness(optimization_description)

    def on_trial(event: TrialEvent) -> None:
        harness.events.append(event)
        raise RuntimeError("report failed")

    run = asyncio.ensure_future(
        run_study(
            harness.study,
            harness.description,
            trials=6,
            evaluate=harness.evaluate,
            on_trial=on_trial,
            parallelism=3,
        )
    )
    await until(lambda: len(harness.pending) == 3)
    harness.settle(1)
    await until(run.done)
    with pytest.raises(RuntimeError, match="report failed"):
        await run

    assert [event["trial"] for event in harness.events] == [1]
    assert sorted(harness.interrupted) == [0, 2]
    assert [trial.state for trial in harness.study.trials] == [
        TrialState.FAIL,
        TrialState.COMPLETE,
        TrialState.FAIL,
    ]
    assert study_summary(harness.study)["failedTrials"] == 0


@pytest.mark.asyncio
async def test_task_cancel_fails_pending(
    optimization_description: OptimizationDescription,
) -> None:
    harness = ParallelHarness(optimization_description)
    run = harness.start(parallelism=3)
    await until(lambda: len(harness.pending) == 3)
    run.cancel()
    await until(run.done)

    with pytest.raises(asyncio.CancelledError):
        await run

    assert sorted(harness.interrupted) == [0, 1, 2]
    assert harness.events == []
    assert [trial.state for trial in harness.study.trials] == [TrialState.FAIL] * 3
    assert all(trial.user_attrs == {UNREPORTED_ATTR: True} for trial in harness.study.trials)
    assert study_summary(harness.study)["failedTrials"] == 0


@pytest.mark.asyncio
async def test_cancel_before_ask(
    optimization_description: OptimizationDescription,
) -> None:
    harness = PausableHarness(optimization_description)
    harness.cancelled = True
    harness.paused = True

    summary = await harness.start()

    assert summary["cancelled"] is True
    assert summary["paused"] is False
    assert harness.study.trials == []
    assert harness.evaluations == []
    assert harness.events == []


@pytest.mark.asyncio
async def test_pause_latched(
    optimization_description: OptimizationDescription,
) -> None:
    harness = ParallelHarness(optimization_description)
    run = harness.start(parallelism=2)
    await until(lambda: len(harness.pending) == 2)
    harness.paused = True
    harness.settle(0)
    await until(lambda: len(harness.events) == 1)
    harness.paused = False
    harness.settle(1)
    await until(run.done)
    summary = await run

    assert summary["paused"] is True
    assert summary["completedTrials"] == 2
    assert [event["trial"] for event in harness.events] == [0, 1]
    assert len(harness.evaluations) == 2


@pytest.mark.asyncio
async def test_suggest_error_fails_batch(
    optimization_description: OptimizationDescription,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = Harness(optimization_description)

    def fail_second(trial: BaseTrial, parameters: Sequence[Parameter]) -> dict[str, Scalar]:
        if trial.number == 1:
            raise RuntimeError("suggest failed")
        return suggest(trial, parameters)

    monkeypatch.setattr(ask_tell, "suggest", fail_second)
    with pytest.raises(RuntimeError, match="suggest failed"):
        await harness.start(parallelism=3)

    # Asking the batch has no suspension point: the first task is cancelled
    # before its evaluation starts, and the second ask still needs cleanup.
    assert harness.evaluations == []
    assert harness.events == []
    assert [trial.state for trial in harness.study.trials] == [TrialState.FAIL] * 2
    assert all(trial.user_attrs == {UNREPORTED_ATTR: True} for trial in harness.study.trials)
