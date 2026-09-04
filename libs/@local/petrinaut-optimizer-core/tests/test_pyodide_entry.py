from __future__ import annotations

import asyncio
import json
import warnings
from typing import Any

import pytest
from optuna.trial import TrialState

from petrinaut_optimizer_core import (
    MAX_STUDY_TRIALS,
    create_browser_study,
    release_browser_study,
    run_browser_study,
    to_python,
)

from .conftest import objective_of_values


class FakeJsProxy:
    """Stands in for a Pyodide JsProxy: only `to_py` matters to the entry point."""

    def __init__(self, value: Any) -> None:
        self.value = value

    def to_py(self) -> Any:
        return self.value


async def evaluate(values: dict[str, Any]) -> dict[str, Any]:
    return {"objective": objective_of_values(values)}


def ignore_event(_event: dict[str, Any]) -> None:
    pass


def never_cancelled() -> bool:
    return False


def test_to_python_unwraps_proxies_and_passes_plain_values_through() -> None:
    assert to_python(FakeJsProxy({"objective": 1.0})) == {"objective": 1.0}
    assert to_python({"objective": 2.0}) == {"objective": 2.0}
    assert to_python(3) == 3


def test_runs_a_study_from_json_with_javascript_style_callbacks(
    optimization_description: dict[str, Any],
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[dict[str, Any]] = []
    evaluated: list[dict[str, Any]] = []

    async def evaluate_as_javascript(values: dict[str, Any]) -> FakeJsProxy:
        evaluated.append(values)
        return FakeJsProxy(
            {"kind": "objective", "objective": objective_of_values(values)}
        )

    summary = asyncio.run(
        run_browser_study(
            handle, 3, evaluate_as_javascript, events.append, never_cancelled
        )
    )

    assert len(evaluated) == 3
    assert [event["trial"] for event in events] == [0, 1, 2]
    assert all(isinstance(event, dict) for event in events)
    assert summary["requestedTrials"] == 3
    assert summary["completedTrials"] == 3
    assert summary["best"] == events[-1]["best"]
    assert handle.requested == 3
    assert handle.running is False


def test_further_trials_continue_the_study_and_count_cumulatively(
    optimization_description: dict[str, Any],
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[dict[str, Any]] = []

    asyncio.run(run_browser_study(handle, 3, evaluate, events.append, never_cancelled))
    summary = asyncio.run(
        run_browser_study(handle, 2, evaluate, events.append, never_cancelled)
    )

    assert [event["trial"] for event in events] == [0, 1, 2, 3, 4]
    assert summary == {
        "requestedTrials": 5,
        "completedTrials": 5,
        "prunedTrials": 0,
        "failedTrials": 0,
        "best": events[-1]["best"],
        "cancelled": False,
    }
    assert handle.requested == 5


def test_a_continued_tpe_study_does_not_repeat_its_startup_trials(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["sampler"] = "tpe"
    description_json = json.dumps(optimization_description)
    continued: list[dict[str, Any]] = []
    restarted: list[dict[str, Any]] = []

    async def record_continued(values: dict[str, Any]) -> dict[str, Any]:
        continued.append(values)
        return await evaluate(values)

    async def record_restarted(values: dict[str, Any]) -> dict[str, Any]:
        restarted.append(values)
        return await evaluate(values)

    handle = create_browser_study(description_json)
    asyncio.run(
        run_browser_study(handle, 10, record_continued, ignore_event, never_cancelled)
    )
    asyncio.run(
        run_browser_study(handle, 5, record_continued, ignore_event, never_cancelled)
    )
    asyncio.run(
        run_browser_study(
            create_browser_study(description_json),
            5,
            record_restarted,
            ignore_event,
            never_cancelled,
        )
    )

    assert handle.study is not None
    assert len(handle.study.get_trials(deepcopy=False)) == 15
    assert restarted == continued[:5]
    assert continued[10:] != restarted


def test_a_stopped_study_continues_from_the_trials_it_holds(
    optimization_description: dict[str, Any],
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    events: list[dict[str, Any]] = []
    evaluations = 0
    cancelled = False

    async def evaluate_then_stop(values: dict[str, Any]) -> dict[str, Any]:
        nonlocal evaluations, cancelled
        evaluations += 1
        cancelled = evaluations == 2
        return await evaluate(values)

    stopped = asyncio.run(
        run_browser_study(
            handle, 4, evaluate_then_stop, events.append, lambda: FakeJsProxy(cancelled)
        )
    )
    cancelled = False
    resumed = asyncio.run(
        run_browser_study(
            handle, 2, evaluate_then_stop, events.append, lambda: FakeJsProxy(cancelled)
        )
    )

    assert stopped["cancelled"] is True
    assert stopped["requestedTrials"] == 4
    assert stopped["completedTrials"] == 1
    assert stopped["failedTrials"] == 1
    assert [event["trial"] for event in events] == [0, 2, 3]
    assert resumed == {
        "requestedTrials": 3,
        "completedTrials": 3,
        "prunedTrials": 0,
        "failedTrials": 1,
        "best": events[-1]["best"],
        "cancelled": False,
    }
    assert handle.requested == 3
    assert handle.study is not None
    assert [trial.state for trial in handle.study.get_trials(deepcopy=False)] == [
        TrialState.COMPLETE,
        TrialState.FAIL,
        TrialState.COMPLETE,
        TrialState.COMPLETE,
    ]


def test_release_drops_the_study(optimization_description: dict[str, Any]) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    release_browser_study(handle)

    assert handle.study is None
    with pytest.raises(ValueError, match="released"):
        run_browser_study(handle, 1, evaluate, ignore_event, never_cancelled)


def test_a_study_runs_one_segment_at_a_time(
    optimization_description: dict[str, Any],
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    async def scenario() -> dict[str, Any]:
        gate: asyncio.Future[None] = asyncio.get_running_loop().create_future()

        async def evaluate_after_gate(values: dict[str, Any]) -> dict[str, Any]:
            await gate
            return await evaluate(values)

        run = asyncio.ensure_future(
            run_browser_study(
                handle, 1, evaluate_after_gate, ignore_event, never_cancelled
            )
        )
        with pytest.raises(ValueError, match="already running"):
            run_browser_study(handle, 1, evaluate, ignore_event, never_cancelled)
        gate.set_result(None)
        return await run

    summary = asyncio.run(scenario())

    assert summary["completedTrials"] == 1
    assert handle.requested == 1
    assert handle.running is False


def test_the_trial_cap_spans_every_segment(
    optimization_description: dict[str, Any],
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))
    handle.requested = MAX_STUDY_TRIALS - 1

    with pytest.raises(ValueError, match="must not exceed"):
        run_browser_study(handle, 2, evaluate, ignore_event, never_cancelled)
    summary = asyncio.run(
        run_browser_study(handle, 1, evaluate, ignore_event, never_cancelled)
    )

    assert summary["requestedTrials"] == MAX_STUDY_TRIALS


@pytest.mark.parametrize("trials", [0, -1, 2.0, True])
def test_rejects_a_trial_count_that_is_not_a_positive_integer(
    optimization_description: dict[str, Any],
    trials: Any,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    with pytest.raises(ValueError, match="trials must be a positive integer"):
        run_browser_study(handle, trials, evaluate, ignore_event, never_cancelled)


def test_parallelism_makes_the_tpe_sampler_account_for_trials_in_flight_without_a_warning(
    optimization_description: dict[str, Any],
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
    assert sequential.study.sampler._constant_liar is False
    assert parallel.study.sampler._constant_liar is True
    with pytest.raises(ValueError, match="parallelism must be a positive integer"):
        create_browser_study(description_json, parallelism=0)


@pytest.mark.parametrize(("segment_parallelism", "expected_peak"), [(None, 2), (1, 1)])
def test_keeps_up_to_the_parallelism_trials_in_flight(
    optimization_description: dict[str, Any],
    segment_parallelism: int | None,
    expected_peak: int,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description), parallelism=2)
    in_flight = 0
    peak = 0

    async def evaluate_slowly(values: dict[str, Any]) -> dict[str, Any]:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        in_flight -= 1
        return await evaluate(values)

    summary = asyncio.run(
        run_browser_study(
            handle,
            5,
            evaluate_slowly,
            ignore_event,
            never_cancelled,
            segment_parallelism,
        )
    )

    assert peak == expected_peak
    assert summary["completedTrials"] == 5


@pytest.mark.parametrize(
    ("cancelled", "completed_trials"),
    [(True, 0), (False, 3)],
)
def test_cancellation_is_unwrapped_from_the_callback_proxy(
    optimization_description: dict[str, Any],
    cancelled: bool,
    completed_trials: int,
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    summary = asyncio.run(
        run_browser_study(
            handle, 3, evaluate, ignore_event, lambda: FakeJsProxy(cancelled)
        )
    )

    assert summary["completedTrials"] == completed_trials
    assert summary["cancelled"] is cancelled


def test_rejects_a_description_that_breaks_a_rule(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["seed"] = -1

    with pytest.raises(ValueError, match="non-negative integer"):
        create_browser_study(json.dumps(optimization_description))


def test_rejects_an_outcome_that_is_not_an_object(
    optimization_description: dict[str, Any],
) -> None:
    handle = create_browser_study(json.dumps(optimization_description))

    async def evaluate_to_a_number(_values: dict[str, Any]) -> float:
        return 1.0

    with pytest.raises(ValueError, match="trial outcome must be a JSON object"):
        asyncio.run(
            run_browser_study(
                handle, 3, evaluate_to_a_number, ignore_event, never_cancelled
            )
        )
