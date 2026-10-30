import asyncio
import json
import logging
import threading
import time
from collections.abc import AsyncIterator
from typing import override

import optuna
import pytest
import pytest_asyncio

from petrinaut import PetrinautClientError, PetrinautRunError
from petrinaut_optimization import petrinaut_optimizer
from petrinaut_optimization.events import EventBus
from petrinaut_optimization.petrinaut_optimizer import PetrinautOptimizer
from petrinaut_optimization.status import Phase, StatusStore, StatusStoreUpdateEvent
from petrinaut_optimizer_core import Scalar


@pytest_asyncio.fixture
async def bus() -> AsyncIterator[EventBus[StatusStoreUpdateEvent]]:
    event_bus = EventBus[StatusStoreUpdateEvent]()
    yield event_bus
    await event_bus.shutdown()


class FakeModel:
    eval_timeout = None

    def __init__(self, description: dict[str, object]) -> None:
        self.description = description
        self.evaluations: list[dict[str, Scalar]] = []
        self.closed = False
        self.close_calls: list[bool] = []

    def describe(self) -> dict[str, object]:
        return self.description

    def objective(self, parameter_values: dict[str, Scalar]) -> float:
        self.evaluations.append(parameter_values)
        return float(
            parameter_values["rate"] + parameter_values["count"] + int(parameter_values["enabled"])
        )

    def close(self, *, graceful: bool = True) -> None:
        self.closed = True
        self.close_calls.append(graceful)


class FailingModel(FakeModel):
    def __init__(self, description: dict[str, object], error: Exception) -> None:
        super().__init__(description)
        self.error = error

    @override
    def objective(self, parameter_values: dict[str, Scalar]) -> float:
        self.evaluations.append(parameter_values)
        raise self.error


class StubbornModel(FakeModel):
    def __init__(self, description: dict[str, object]) -> None:
        super().__init__(description)
        self.entered = threading.Event()
        self.release = threading.Event()

    @override
    def objective(self, parameter_values: dict[str, Scalar]) -> float:
        self.entered.set()
        self.release.wait()
        raise PetrinautClientError("session closed")


def test_objective_flat_values(
    optimization_description: dict[str, object], bus: EventBus[StatusStoreUpdateEvent]
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    assert optimizer.objective(trial) == pytest.approx(10.25, rel=0, abs=0)
    assert model.evaluations == [{"rate": 1.25, "count": 8, "enabled": True}]


def test_objective_prunes_run_error(
    optimization_description: dict[str, object],
    caplog: pytest.LogCaptureFixture,
    bus: EventBus[StatusStoreUpdateEvent],
) -> None:
    sensitive_detail = "secret user-authored expression"
    model = FailingModel(optimization_description, PetrinautRunError(sensitive_detail))
    optimizer = PetrinautOptimizer(model, bus=bus)
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    with (
        caplog.at_level(logging.WARNING, logger="pn_optimize"),
        pytest.raises(optuna.TrialPruned),
    ):
        optimizer.objective(trial)

    record = next(record for record in caplog.records if "pruned" in record.getMessage())
    assert sensitive_detail not in record.getMessage()
    assert vars(record)["error_type"] == "PetrinautRunError"


def test_objective_transport_error(
    optimization_description: dict[str, object], bus: EventBus[StatusStoreUpdateEvent]
) -> None:
    model = FailingModel(optimization_description, PetrinautClientError("transport failed"))
    optimizer = PetrinautOptimizer(model, bus=bus)
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    with pytest.raises(PetrinautClientError, match="transport failed"):
        optimizer.objective(trial)


@pytest.mark.parametrize(
    "change",
    [
        # A shape the protocol schema rejects before the shared core sees it.
        {"direction": "up"},
        # A rule the shared core enforces; its own suite covers the full matrix.
        {
            "study": {
                "trials": petrinaut_optimizer.MAX_STUDY_TRIALS + 1,
                "sampler": "random",
                "seed": 42,
            }
        },
    ],
)
def test_description_invalid(
    optimization_description: dict[str, object],
    change: dict[str, object],
    bus: EventBus[StatusStoreUpdateEvent],
) -> None:
    optimization_description.update(change)

    with pytest.raises(ValueError, match=r"direction|trials"):
        PetrinautOptimizer(FakeModel(optimization_description), bus=bus)


def _status_bus_with_run(
    bus: EventBus[StatusStoreUpdateEvent],
) -> tuple[StatusStore, str]:
    statuses = StatusStore()
    statuses.subscribe(event_bus=bus)
    return statuses, statuses.create().run_id


@pytest.mark.asyncio
async def test_pump_completed_frames(
    optimization_description: dict[str, object], bus: EventBus[StatusStoreUpdateEvent]
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    statuses, run_id = _status_bus_with_run(bus)
    frames: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
        )

    state = await drive()
    data = [
        json.loads(frame.removeprefix("data: ")) for frame in frames if frame.startswith("data: ")
    ]

    assert state == "completed"
    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert len(data) == 3
    assert all(
        set(payload) == {"step", "params", "init_state", "metric", "state"} for payload in data
    )
    assert model.close_calls == [True]
    await bus.drain()
    status = statuses.get(run_id)
    assert status is not None
    assert status.phase is Phase.done


@pytest.mark.asyncio
async def test_pump_lifecycle_log(
    optimization_description: dict[str, object],
    caplog: pytest.LogCaptureFixture,
    bus: EventBus[StatusStoreUpdateEvent],
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    _statuses, run_id = _status_bus_with_run(bus)

    async def drive() -> str:
        return await optimizer.pump_events(
            run_id,
            optimizer.n_trials,
            on_event=lambda _frame: None,
            cancel_event=asyncio.Event(),
            correlation={"request_id": "request-s1"},
        )

    with caplog.at_level(logging.INFO, logger="pn_optimize"):
        await drive()

    events = {
        getattr(record, "event", None): record
        for record in caplog.records
        if record.name == "pn_optimize"
    }
    for expected in ("study_started", "study_completed"):
        record = events[expected]
        assert vars(record)["run_id"] == run_id
        assert vars(record)["request_id"] == "request-s1"
        assert vars(record)["trials"] == optimizer.n_trials


@pytest.mark.asyncio
async def test_pump_failure_frames(
    optimization_description: dict[str, object], bus: EventBus[StatusStoreUpdateEvent]
) -> None:
    model = FailingModel(optimization_description, PetrinautClientError("transport failed"))
    optimizer = PetrinautOptimizer(model, bus=bus)
    statuses, run_id = _status_bus_with_run(bus)
    frames: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
        )

    state = await drive()
    await bus.drain()
    status = statuses.get(run_id)

    assert state == "failed"
    assert json.loads(frames[-1].removeprefix("data: ")) == {
        "state": "ERROR",
        "message": "transport failed",
    }
    assert "event: done\ndata: {}\n\n" not in frames
    assert model.close_calls == [False]
    assert status is not None
    assert status.phase is Phase.error


@pytest.mark.asyncio
async def test_pump_cancel_prompt(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    bus: EventBus[StatusStoreUpdateEvent],
) -> None:
    study = optimization_description["study"]
    assert isinstance(study, dict)
    study["trials"] = 1
    monkeypatch.setattr(petrinaut_optimizer, "_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    model = StubbornModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    _statuses, run_id = _status_bus_with_run(bus)
    frames: list[str] = []
    cancel_event = asyncio.Event()

    async def drive() -> str:
        async def cancel_after_entry() -> None:
            await asyncio.to_thread(model.entered.wait, 1)
            cancel_event.set()

        canceller = asyncio.create_task(cancel_after_entry())
        started_at = time.monotonic()
        state = await optimizer.pump_events(
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=cancel_event,
        )
        assert time.monotonic() - started_at < 0.5
        await canceller
        model.release.set()
        await asyncio.sleep(0.05)
        return state

    state = await drive()

    assert state == "cancelled"
    # The caller owns the terminal cancelled frame, so none is appended here.
    assert frames == []
    assert model.closed is True
    assert model.close_calls == [False]


def test_deadline_env_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    variable = petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE
    monkeypatch.delenv(variable, raising=False)
    assert petrinaut_optimizer.max_study_seconds_from_environment() == pytest.approx(
        900.0, rel=0, abs=0
    )

    monkeypatch.setenv(variable, "12.5")
    assert petrinaut_optimizer.max_study_seconds_from_environment() == pytest.approx(
        12.5, rel=0, abs=0
    )

    monkeypatch.setenv(variable, "not-a-number")
    assert petrinaut_optimizer.max_study_seconds_from_environment() == pytest.approx(
        900.0, rel=0, abs=0
    )

    monkeypatch.setenv(variable, "0")
    assert petrinaut_optimizer.max_study_seconds_from_environment() == pytest.approx(
        0.0, rel=0, abs=0
    )


@pytest.mark.parametrize("raw", ["inf", "-inf", "nan", "1e400"])
def test_deadline_env_nonfinite(monkeypatch: pytest.MonkeyPatch, raw: str) -> None:
    monkeypatch.setenv(petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, raw)
    assert petrinaut_optimizer.max_study_seconds_from_environment() == pytest.approx(
        900.0, rel=0, abs=0
    )


@pytest.mark.asyncio
async def test_pump_deadline_failure(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    *,
    bus: EventBus[StatusStoreUpdateEvent],
) -> None:
    study = optimization_description["study"]
    assert isinstance(study, dict)
    study["trials"] = 1
    monkeypatch.setenv(petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, "0.05")
    monkeypatch.setattr(petrinaut_optimizer, "_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    model = StubbornModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    statuses, run_id = _status_bus_with_run(bus)
    frames: list[str] = []
    outcomes: list[str] = []

    async def drive() -> str:
        started_at = time.monotonic()
        state = await optimizer.pump_events(
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
            on_outcome=outcomes.append,
        )
        assert time.monotonic() - started_at < 0.5
        model.release.set()
        await asyncio.sleep(0.05)
        return state

    with caplog.at_level(logging.WARNING, logger="pn_optimize"):
        state = await drive()
    await bus.drain()
    status = statuses.get(run_id)

    assert state == "failed"
    assert outcomes == ["failed"]
    assert frames == [
        (
            'data: {"state": "ERROR", "message": "optimization study exceeded '
            'its 0.05 second execution limit"}\n\n'
        )
    ]
    assert model.closed is True
    assert model.close_calls == [False]
    assert status is not None
    assert status.phase is Phase.error
    timeout = next(
        record for record in caplog.records if getattr(record, "event", None) == "study_timeout"
    )
    assert vars(timeout)["run_id"] == run_id
    assert vars(timeout)["max_study_seconds"] == pytest.approx(0.05, rel=0, abs=0)


@pytest.mark.asyncio
async def test_pump_before_deadline_complete(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    bus: EventBus[StatusStoreUpdateEvent],
) -> None:
    monkeypatch.setenv(petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, "5")
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    _statuses, run_id = _status_bus_with_run(bus)
    frames: list[str] = []
    outcomes: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
            on_outcome=outcomes.append,
        )

    state = await drive()

    assert state == "completed"
    assert outcomes == ["completed"]
    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert all('"state": "ERROR"' not in frame for frame in frames)
    assert model.close_calls == [True]


@pytest.mark.asyncio
async def test_pump_queued_completion(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    bus: EventBus[StatusStoreUpdateEvent],
) -> None:
    """A completion already queued when the ceiling lapses is still reported."""
    study = optimization_description["study"]
    assert isinstance(study, dict)
    study["trials"] = 1
    monkeypatch.setenv(petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, "0.000001")

    def preloaded_worker(
        _self: PetrinautOptimizer,
        *,
        loop: asyncio.AbstractEventLoop,
        events: asyncio.Queue[dict[str, object] | petrinaut_optimizer._StudyFinished],
        stop_flag: threading.Event,
        n_trials: int,
        payload_builder: object,
    ) -> tuple[threading.Thread, object]:
        del loop, stop_flag, n_trials, payload_builder
        # The study "finished" before the pump's first deadline check: both
        # the trial payload and the sentinel are already queued.
        events.put_nowait({
            "step": 0,
            "params": {"rate": 1.0},
            "init_state": {},
            "metric": 2.0,
            "state": "COMPLETE",
        })
        events.put_nowait(petrinaut_optimizer._SENTINEL)
        worker = threading.Thread(target=lambda: None, daemon=True)
        worker.start()
        return worker, petrinaut_optimizer.tracer.start_span("test-study")

    monkeypatch.setattr(PetrinautOptimizer, "_start_study_worker", preloaded_worker)
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    statuses, run_id = _status_bus_with_run(bus)
    frames: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
        )

    state = await drive()
    await bus.drain()
    status = statuses.get(run_id)

    assert state == "completed"
    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert all('"state": "ERROR"' not in frame for frame in frames)
    assert status is not None
    assert status.phase is Phase.done
