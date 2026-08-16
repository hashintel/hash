from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from typing import Any

import optuna
import pytest
from fastapi import FastAPI
from petrinaut import PetrinautClientError, PetrinautRunError

from src import petrinaut_optimizer
from src.petrinaut_optimizer import PetrinautOptimizer
from src.utils import Phase, StatusStore


class FakeModel:
    eval_timeout = None

    def __init__(self, description: dict[str, Any]) -> None:
        self.description = description
        self.evaluations: list[dict[str, Any]] = []
        self.closed = False
        self.close_calls: list[bool] = []

    def describe_optimization(self) -> dict[str, Any]:
        return self.description

    def objective(self, parameter_values: dict[str, Any]) -> float:
        self.evaluations.append(parameter_values)
        return float(
            parameter_values["rate"]
            + parameter_values["count"]
            + int(parameter_values["enabled"])
        )

    def close(self, *, graceful: bool = True) -> None:
        self.closed = True
        self.close_calls.append(graceful)


class FailingModel(FakeModel):
    def __init__(self, description: dict[str, Any], error: Exception) -> None:
        super().__init__(description)
        self.error = error

    def objective(self, parameter_values: dict[str, Any]) -> float:
        self.evaluations.append(parameter_values)
        raise self.error


class StubbornModel(FakeModel):
    def __init__(self, description: dict[str, Any]) -> None:
        super().__init__(description)
        self.entered = threading.Event()
        self.release = threading.Event()

    def objective(self, parameter_values: dict[str, Any]) -> float:
        self.entered.set()
        self.release.wait()
        raise PetrinautClientError("session closed")


def test_maps_float_integer_step_and_boolean_descriptors_to_optuna(
    optimization_description: dict,
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    trial = optuna.trial.FixedTrial({"rate": 0.5, "count": 6, "enabled": False})

    assert optimizer.suggest(trial) == {
        "rate": 0.5,
        "count": 6,
        "enabled": False,
    }
    distributions = trial.distributions
    assert isinstance(distributions["rate"], optuna.distributions.FloatDistribution)
    assert distributions["rate"].log is True
    assert isinstance(distributions["count"], optuna.distributions.IntDistribution)
    assert distributions["count"].step == 2
    assert distributions["count"].log is False
    assert isinstance(
        distributions["enabled"], optuna.distributions.CategoricalDistribution
    )
    assert distributions["enabled"].choices == (False, True)


def test_objective_sends_only_flat_suggested_values(
    optimization_description: dict,
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    assert optimizer.objective(trial) == 10.25
    assert model.evaluations == [{"rate": 1.25, "count": 8, "enabled": True}]


def test_objective_prunes_only_evaluation_errors(
    optimization_description: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    sensitive_detail = "secret user-authored expression"
    model = FailingModel(
        optimization_description, PetrinautRunError(sensitive_detail)
    )
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    with (
        caplog.at_level(logging.WARNING, logger="pn_optimize"),
        pytest.raises(optuna.TrialPruned),
    ):
        optimizer.objective(trial)

    record = next(
        record for record in caplog.records if "pruned" in record.getMessage()
    )
    assert sensitive_detail not in record.getMessage()
    assert record.error_type == "PetrinautRunError"


def test_objective_propagates_transport_errors(
    optimization_description: dict,
) -> None:
    model = FailingModel(
        optimization_description, PetrinautClientError("transport failed")
    )
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    with pytest.raises(PetrinautClientError, match="transport failed"):
        optimizer.objective(trial)


def test_uses_the_session_supplied_seed_for_deterministic_sampling(
    optimization_description: dict,
) -> None:
    first = PetrinautOptimizer(  # type: ignore[arg-type]
        FakeModel(optimization_description)
    )
    second = PetrinautOptimizer(  # type: ignore[arg-type]
        FakeModel(optimization_description)
    )

    assert first.suggest(first.study.ask()) == second.suggest(second.study.ask())


@pytest.mark.parametrize(
    "change",
    [
        {"direction": "up"},
        {"study": {"trials": 0, "sampler": "random", "seed": 42}},
        # The service-side trial cap bounds every run's event log even when
        # the reported study is huge.
        {
            "study": {
                "trials": petrinaut_optimizer.MAX_STUDY_TRIALS + 1,
                "sampler": "random",
                "seed": 42,
            }
        },
        {"study": {"trials": 1, "sampler": "unknown", "seed": 42}},
        {"study": {"trials": 1, "sampler": "random", "seed": -1}},
        {
            "parameters": [
                {
                    "identifier": "rate",
                    "type": "float",
                    "minimum": 0,
                    "maximum": 1,
                    "scale": "log",
                }
            ]
        },
        {
            "parameters": [
                {
                    "identifier": "count",
                    "type": "int",
                    "minimum": 1,
                    "maximum": 10,
                    "step": 2,
                    "scale": "log",
                }
            ]
        },
    ],
)
def test_rejects_invalid_session_descriptions(
    optimization_description: dict,
    change: dict[str, Any],
) -> None:
    optimization_description.update(change)

    with pytest.raises(ValueError):
        PetrinautOptimizer(  # type: ignore[arg-type]
            FakeModel(optimization_description)
        )


def _status_app_with_run() -> tuple[FastAPI, str]:
    app = FastAPI()
    app.state.statuses = StatusStore()
    return app, app.state.statuses.create().run_id


def test_pump_events_appends_frames_and_completes(
    optimization_description: dict,
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    app, run_id = _status_app_with_run()
    frames: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            app,
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
        )

    state = asyncio.run(drive())
    data = [
        json.loads(frame.removeprefix("data: "))
        for frame in frames
        if frame.startswith("data: ")
    ]

    assert state == "completed"
    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert len(data) == 3
    assert all(
        set(payload) == {"step", "params", "init_state", "metric", "state"}
        for payload in data
    )
    assert model.close_calls == [True]
    status = app.state.statuses.get(run_id)
    assert status is not None
    assert status.phase is Phase.done


def test_pump_events_logs_the_study_lifecycle_with_correlation(
    optimization_description: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    app, run_id = _status_app_with_run()

    async def drive() -> str:
        return await optimizer.pump_events(
            app,
            run_id,
            optimizer.n_trials,
            on_event=lambda _frame: None,
            cancel_event=asyncio.Event(),
            correlation={"request_id": "request-s1"},
        )

    with caplog.at_level(logging.INFO, logger="pn_optimize"):
        asyncio.run(drive())

    events = {
        getattr(record, "event", None): record
        for record in caplog.records
        if record.name == "pn_optimize"
    }
    for expected in ("study_started", "study_completed"):
        record = events[expected]
        assert record.run_id == run_id
        assert record.request_id == "request-s1"
        assert record.trials == optimizer.n_trials


def test_pump_events_reports_a_study_failure_without_done(
    optimization_description: dict,
) -> None:
    model = FailingModel(
        optimization_description, PetrinautClientError("transport failed")
    )
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    app, run_id = _status_app_with_run()
    frames: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            app,
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
        )

    state = asyncio.run(drive())
    status = app.state.statuses.get(run_id)

    assert state == "failed"
    assert json.loads(frames[-1].removeprefix("data: ")) == {
        "state": "ERROR",
        "message": "transport failed",
    }
    assert "event: done\ndata: {}\n\n" not in frames
    assert model.close_calls == [False]
    assert status is not None
    assert status.phase is Phase.error


def test_pump_events_cancellation_stops_the_study_promptly(
    optimization_description: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimization_description["study"]["trials"] = 1
    monkeypatch.setattr(petrinaut_optimizer, "_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    model = StubbornModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    app, run_id = _status_app_with_run()
    frames: list[str] = []
    cancel_event = asyncio.Event()

    async def drive() -> str:
        async def cancel_after_entry() -> None:
            await asyncio.to_thread(model.entered.wait, 1)
            cancel_event.set()

        canceller = asyncio.create_task(cancel_after_entry())
        started_at = time.monotonic()
        state = await optimizer.pump_events(
            app,
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

    state = asyncio.run(drive())

    assert state == "cancelled"
    # The caller owns the terminal cancelled frame, so none is appended here.
    assert frames == []
    assert model.closed is True
    assert model.close_calls == [False]


def test_max_study_seconds_environment_parsing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    variable = petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE
    monkeypatch.delenv(variable, raising=False)
    assert petrinaut_optimizer.max_study_seconds_from_environment() == 900.0

    monkeypatch.setenv(variable, "12.5")
    assert petrinaut_optimizer.max_study_seconds_from_environment() == 12.5

    monkeypatch.setenv(variable, "not-a-number")
    assert petrinaut_optimizer.max_study_seconds_from_environment() == 900.0

    monkeypatch.setenv(variable, "0")
    assert petrinaut_optimizer.max_study_seconds_from_environment() == 0.0


@pytest.mark.parametrize("raw", ["inf", "-inf", "nan", "1e400"])
def test_max_study_seconds_rejects_non_finite_values(
    monkeypatch: pytest.MonkeyPatch, raw: str
) -> None:
    monkeypatch.setenv(
        petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, raw
    )
    assert petrinaut_optimizer.max_study_seconds_from_environment() == 900.0


def test_pump_events_enforces_the_study_wall_clock_ceiling(
    optimization_description: dict,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    optimization_description["study"]["trials"] = 1
    monkeypatch.setenv(
        petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, "0.05"
    )
    monkeypatch.setattr(petrinaut_optimizer, "_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    model = StubbornModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    app, run_id = _status_app_with_run()
    frames: list[str] = []
    outcomes: list[str] = []

    async def drive() -> str:
        started_at = time.monotonic()
        state = await optimizer.pump_events(
            app,
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
        state = asyncio.run(drive())
    status = app.state.statuses.get(run_id)

    assert state == "failed"
    assert outcomes == ["failed"]
    assert frames == [
        'data: {"state": "ERROR", "message": "optimization study exceeded '
        'its 0.05 second execution limit"}\n\n'
    ]
    assert model.closed is True
    assert model.close_calls == [False]
    assert status is not None
    assert status.phase is Phase.error
    timeout = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "study_timeout"
    )
    assert timeout.run_id == run_id
    assert timeout.max_study_seconds == 0.05


def test_pump_events_completed_before_the_ceiling_is_not_misreported(
    optimization_description: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, "5"
    )
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    app, run_id = _status_app_with_run()
    frames: list[str] = []
    outcomes: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            app,
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
            on_outcome=outcomes.append,
        )

    state = asyncio.run(drive())

    assert state == "completed"
    assert outcomes == ["completed"]
    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert all('"state": "ERROR"' not in frame for frame in frames)
    assert model.close_calls == [True]


def test_pump_events_drains_a_queued_completion_after_the_deadline(
    optimization_description: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A completion already queued when the ceiling lapses is still reported."""
    optimization_description["study"]["trials"] = 1
    monkeypatch.setenv(
        petrinaut_optimizer.MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, "0.000001"
    )

    def preloaded_worker(
        self: PetrinautOptimizer,
        _loop: asyncio.AbstractEventLoop,
        events: asyncio.Queue,
        _stop_flag: threading.Event,
        _n_trials: int,
        _payload_builder: Any,
    ) -> tuple[threading.Thread, Any]:
        # The study "finished" before the pump's first deadline check: both
        # the trial payload and the sentinel are already queued.
        events.put_nowait(
            {
                "step": 0,
                "params": {"rate": 1.0},
                "init_state": {},
                "metric": 2.0,
                "state": "COMPLETE",
            }
        )
        events.put_nowait(petrinaut_optimizer._SENTINEL)
        worker = threading.Thread(target=lambda: None, daemon=True)
        worker.start()
        return worker, petrinaut_optimizer.tracer.start_span("test-study")

    monkeypatch.setattr(
        PetrinautOptimizer, "_start_study_worker", preloaded_worker
    )
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    app, run_id = _status_app_with_run()
    frames: list[str] = []

    async def drive() -> str:
        return await optimizer.pump_events(
            app,
            run_id,
            optimizer.n_trials,
            on_event=frames.append,
            cancel_event=asyncio.Event(),
        )

    state = asyncio.run(drive())
    status = app.state.statuses.get(run_id)

    assert state == "completed"
    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert all('"state": "ERROR"' not in frame for frame in frames)
    assert status is not None
    assert status.phase is Phase.done
