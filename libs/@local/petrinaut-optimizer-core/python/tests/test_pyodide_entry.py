import asyncio
import json
import warnings
from typing import cast

import pytest
from optuna.samplers import TPESampler
from optuna.trial import TrialState

from petrinaut_optimizer_core import MAX_STUDY_TRIALS, importance, pyodide_entry
from petrinaut_optimizer_core.pyodide_entry import (
    create_browser_study,
    release_browser_study,
    run_browser_study,
    to_python,
)
from petrinaut_optimizer_core.reports import TrialEvent
from petrinaut_optimizer_core.study import Scalar

from ._support import OptimizationDescription, completed, objective_of_values


class FakeJsProxy:
    """Stands in for a Pyodide JsProxy: only `to_py` matters to the entry point."""

    def __init__(self, value: object) -> None:
        self.value = value

    def to_py(self) -> object:
        return self.value


def evaluate(values: dict[str, Scalar]) -> asyncio.Future[dict[str, float]]:
    return completed({"objective": objective_of_values(values)})


def ignore_event(_event: TrialEvent) -> None:
    pass


def never_cancelled() -> bool:
    return False


def test_to_python_proxy_and_plain() -> None:
    assert to_python(FakeJsProxy({"objective": 1.0})) == {"objective": 1.0}
    assert to_python({"objective": 2.0}) == {"objective": 2.0}
    assert to_python(3) == 3


@pytest.mark.asyncio
async def test_browser_js_callbacks(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[TrialEvent] = []
    evaluated: list[dict[str, Scalar]] = []

    def evaluate_as_javascript(values: dict[str, Scalar]) -> asyncio.Future[FakeJsProxy]:
        evaluated.append(values)
        return completed(FakeJsProxy({"objective": objective_of_values(values)}))

    summary = await run_browser_study(
        handle,
        3,
        evaluate=evaluate_as_javascript,
        on_trial=events.append,
        is_cancelled=never_cancelled,
    )

    assert len(evaluated) == 3
    assert [event["trial"] for event in events] == [0, 1, 2]
    assert all(isinstance(event, dict) for event in events)
    # Three completed trials over three parameters are enough for an estimate;
    # the host fades it below the floor.
    assert summary.pop("importances")["completedTrials"] == 3
    assert summary == {
        "requestedTrials": 3,
        "completedTrials": 3,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": events[-1]["best"],
        "cancelled": False,
        "paused": False,
    }
    assert handle.requested == 3
    assert handle.running is False


@pytest.mark.asyncio
async def test_browser_cancel_continue(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[TrialEvent] = []
    evaluations = 0
    cancelled = False

    async def evaluate_then_stop(values: dict[str, Scalar]) -> dict[str, float]:
        nonlocal evaluations, cancelled
        evaluations += 1
        cancelled = evaluations == 2
        return await evaluate(values)

    stopped = await run_browser_study(
        handle,
        4,
        evaluate=evaluate_then_stop,
        on_trial=events.append,
        is_cancelled=lambda: cancelled,
    )
    cancelled = False
    resumed = await run_browser_study(
        handle,
        2,
        evaluate=evaluate_then_stop,
        on_trial=events.append,
        is_cancelled=lambda: cancelled,
    )

    assert stopped["cancelled"] is True
    assert stopped["requestedTrials"] == 4
    assert stopped["completedTrials"] == 1
    assert stopped["failedTrials"] == 0
    assert [event["trial"] for event in events] == [0, 2, 3]
    assert "importances" not in stopped, "one completed trial supports no estimate"
    assert resumed.pop("importances")["completedTrials"] == 3
    assert resumed == {
        "requestedTrials": 3,
        "completedTrials": 3,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": events[-1]["best"],
        "cancelled": False,
        "paused": False,
    }, "the stopped trial appears in no counter, so 3 of 3 steps read as finished"
    assert handle.requested == 3
    assert handle.study is not None
    assert [trial.state for trial in handle.study.get_trials(deepcopy=False)] == [
        TrialState.COMPLETE,
        TrialState.FAIL,
        TrialState.COMPLETE,
        TrialState.COMPLETE,
    ]


@pytest.mark.asyncio
async def test_browser_pause_continue(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[TrialEvent] = []
    evaluations = 0
    paused = False

    async def evaluate_then_pause(values: dict[str, Scalar]) -> dict[str, float]:
        nonlocal evaluations, paused
        evaluations += 1
        paused = evaluations == 2
        return await evaluate(values)

    first = await run_browser_study(
        handle,
        4,
        evaluate=evaluate_then_pause,
        on_trial=events.append,
        is_cancelled=never_cancelled,
        is_paused=lambda: paused,
    )
    requested_after_pause = handle.requested
    paused = False
    resumed = await run_browser_study(
        handle,
        2,
        evaluate=evaluate_then_pause,
        on_trial=events.append,
        is_cancelled=never_cancelled,
        is_paused=lambda: paused,
    )

    assert first["paused"] is True
    assert first["cancelled"] is False
    assert first["requestedTrials"] == 4
    # The second trial was in flight when the pause landed: told and reported,
    # not failed, so the study heads for the trials it was told.
    assert first["completedTrials"] == 2
    assert first["failedTrials"] == 0
    assert requested_after_pause == 2
    assert [event["trial"] for event in events] == [0, 1, 2, 3]
    assert resumed["paused"] is False
    assert resumed["requestedTrials"] == 4
    assert resumed["completedTrials"] == 4
    assert handle.study is not None
    assert [trial.state for trial in handle.study.get_trials(deepcopy=False)] == [
        TrialState.COMPLETE
    ] * 4


@pytest.mark.asyncio
async def test_browser_error_continue(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[TrialEvent] = []
    evaluations = 0

    async def evaluate_then_crash(values: dict[str, Scalar]) -> dict[str, float]:
        nonlocal evaluations
        evaluations += 1
        if evaluations == 2:
            raise RuntimeError("worker crashed")
        return await evaluate(values)

    with pytest.raises(RuntimeError, match="worker crashed"):
        await run_browser_study(
            handle,
            3,
            evaluate=evaluate_then_crash,
            on_trial=events.append,
            is_cancelled=never_cancelled,
        )
    assert handle.running is False
    assert handle.requested == 1
    assert handle.study is not None
    assert [trial.state for trial in handle.study.get_trials(deepcopy=False)] == [
        TrialState.COMPLETE,
        TrialState.FAIL,
    ]

    resumed = await run_browser_study(
        handle,
        2,
        evaluate=evaluate_then_crash,
        on_trial=events.append,
        is_cancelled=never_cancelled,
    )

    assert [event["trial"] for event in events] == [0, 2, 3]
    assert resumed.pop("importances")["completedTrials"] == 3
    assert resumed == {
        "requestedTrials": 3,
        "completedTrials": 3,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": events[-1]["best"],
        "cancelled": False,
        "paused": False,
    }
    assert handle.requested == 3


def test_release_study(optimization_description: OptimizationDescription) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    release_browser_study(handle)

    assert handle.study is None
    with pytest.raises(ValueError, match="released"):
        run_browser_study(
            handle, 1, evaluate=evaluate, on_trial=ignore_event, is_cancelled=never_cancelled
        )


@pytest.mark.asyncio
async def test_browser_concurrent_segment(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    gate: asyncio.Future[None] = asyncio.get_running_loop().create_future()

    async def evaluate_after_gate(values: dict[str, Scalar]) -> dict[str, float]:
        await gate
        return await evaluate(values)

    run = asyncio.ensure_future(
        run_browser_study(
            handle,
            1,
            evaluate=evaluate_after_gate,
            on_trial=ignore_event,
            is_cancelled=never_cancelled,
        )
    )
    with pytest.raises(ValueError, match="already running"):
        run_browser_study(
            handle, 1, evaluate=evaluate, on_trial=ignore_event, is_cancelled=never_cancelled
        )
    gate.set_result(None)
    summary = await run

    assert summary["completedTrials"] == 1
    assert handle.requested == 1
    assert handle.running is False


@pytest.mark.asyncio
async def test_browser_trial_cap(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    handle.requested = MAX_STUDY_TRIALS - 1

    with pytest.raises(ValueError, match="must not exceed"):
        run_browser_study(
            handle, 2, evaluate=evaluate, on_trial=ignore_event, is_cancelled=never_cancelled
        )
    summary = await run_browser_study(
        handle, 1, evaluate=evaluate, on_trial=ignore_event, is_cancelled=never_cancelled
    )

    assert summary["requestedTrials"] == MAX_STUDY_TRIALS


def test_browser_nonpositive_trials(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    with pytest.raises(ValueError, match="trials must be a positive integer"):
        run_browser_study(
            handle, 0, evaluate=evaluate, on_trial=ignore_event, is_cancelled=never_cancelled
        )


@pytest.mark.parametrize("trials", [2.0, True])
def test_browser_trials_type(
    optimization_description: OptimizationDescription,
    trials: object,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    with pytest.raises(TypeError, match="trials must be a positive integer"):
        run_browser_study(
            handle,
            cast("int", trials),
            evaluate=evaluate,
            on_trial=ignore_event,
            is_cancelled=never_cancelled,
        )
    assert handle.requested == 0


def test_browser_parallel_sampler(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["sampler"] = "tpe"
    description_json = json.dumps(optimization_description)

    with warnings.catch_warnings():
        warnings.simplefilter("error")
        sequential = create_browser_study(description_json)
        parallel = create_browser_study(description_json, parallelism=3)

    assert sequential.parallelism == 1
    assert parallel.parallelism == 3
    assert sequential.study is not None
    assert parallel.study is not None
    assert isinstance(sequential.study.sampler, TPESampler)
    assert isinstance(parallel.study.sampler, TPESampler)
    assert sequential.study.sampler._constant_liar is False
    assert parallel.study.sampler._constant_liar is True
    with pytest.raises(ValueError, match="parallelism must be a positive integer"):
        create_browser_study(description_json, parallelism=0)
    with pytest.raises(TypeError, match="parallelism must be a positive integer"):
        create_browser_study(description_json, parallelism=True)


def test_browser_description_type() -> None:
    with pytest.raises(TypeError, match="description must be a JSON object"):
        create_browser_study(json.dumps([]))


def test_browser_invalid_description(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["seed"] = -1

    with pytest.raises(ValueError, match="non-negative integer"):
        create_browser_study(json.dumps(optimization_description))


@pytest.mark.asyncio
async def test_browser_outcome_type(
    optimization_description: OptimizationDescription,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    def evaluate_to_a_number(_values: dict[str, Scalar]) -> asyncio.Future[float]:
        return completed(1.0)

    with pytest.raises(TypeError, match="trial outcome must be a JSON object"):
        await run_browser_study(
            handle,
            3,
            evaluate=evaluate_to_a_number,
            on_trial=ignore_event,
            is_cancelled=never_cancelled,
        )


@pytest.mark.asyncio
async def test_browser_importance_cadence(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["trials"] = 60
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[TrialEvent] = []

    summary = await run_browser_study(
        handle, 60, evaluate=evaluate, on_trial=events.append, is_cancelled=never_cancelled
    )

    carrying = [event["trial"] for event in events if "importances" in event]
    assert carrying == [49, 59], "the 50th and 60th completed trials, floor 50, cadence 10"
    for event in events:
        if "importances" in event:
            block = event["importances"]
            assert set(block["values"]) == {"rate", "count", "enabled"}
            assert block["completedTrials"] == event["trial"] + 1
            assert sum(block["values"].values()) == pytest.approx(1.0)
    assert summary["importances"]["completedTrials"] == 60
    assert set(summary["importances"]["values"]) == {"rate", "count", "enabled"}


@pytest.mark.asyncio
async def test_browser_importance_below_floor(
    optimization_description: OptimizationDescription,
) -> None:
    optimization_description["study"]["trials"] = 20
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[TrialEvent] = []

    summary = await run_browser_study(
        handle, 20, evaluate=evaluate, on_trial=events.append, is_cancelled=never_cancelled
    )

    assert all("importances" not in event for event in events)
    assert summary["importances"]["completedTrials"] == 20


@pytest.mark.asyncio
async def test_browser_importance_failure(
    optimization_description: OptimizationDescription,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def explode(*_args: object, **_kwargs: object) -> dict[str, float]:
        raise RuntimeError("numpy went away")

    monkeypatch.setattr(importance, "get_param_importances", explode)
    optimization_description["study"]["trials"] = 60
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[TrialEvent] = []

    summary = await run_browser_study(
        handle, 60, evaluate=evaluate, on_trial=events.append, is_cancelled=never_cancelled
    )

    assert handle.study is not None
    assert pyodide_entry.importances_of(handle.study) is None
    assert all("importances" not in event for event in events)
    assert "importances" not in summary
    assert summary["completedTrials"] == 60
