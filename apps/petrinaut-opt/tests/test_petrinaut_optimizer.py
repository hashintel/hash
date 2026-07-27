import asyncio
import json
import logging
import threading
import time
from collections.abc import Mapping
from typing import override

import optuna
import pytest
from fastapi import FastAPI
from pydantic import JsonValue, ValidationError

from src import petrinaut_optimizer
from src.petrinaut_client import PetrinautClientError, PetrinautRunError, Scalar
from src.petrinaut_optimizer import PetrinautOptimizer
from src.utils import Phase, StatusStore


class FakeModel:
    def __init__(self, description: dict[str, JsonValue]) -> None:
        self.description = description
        self.evaluations: list[Mapping[str, Scalar]] = []
        self.closed = False
        self.close_calls: list[bool] = []

    def describe_optimization(self) -> dict[str, JsonValue]:
        return self.description

    def objective(self, parameter_values: Mapping[str, Scalar], /) -> float:
        self.evaluations.append(parameter_values)
        rate = parameter_values["rate"]
        count = parameter_values["count"]
        enabled = parameter_values["enabled"]
        return float(rate) + float(count) + float(enabled)

    def close(self, *, graceful: bool = True) -> None:
        self.closed = True
        self.close_calls.append(graceful)


class SlowModel(FakeModel):
    @override
    def objective(self, parameter_values: Mapping[str, Scalar], /) -> float:
        time.sleep(0.04)
        return super().objective(parameter_values)


class FailingModel(FakeModel):
    def __init__(self, description: dict[str, JsonValue], error: Exception) -> None:
        super().__init__(description)
        self.error = error

    @override
    def objective(self, parameter_values: Mapping[str, Scalar], /) -> float:
        self.evaluations.append(parameter_values)
        raise self.error


class StubbornModel(FakeModel):
    def __init__(self, description: dict[str, JsonValue]) -> None:
        super().__init__(description)
        self.entered = threading.Event()
        self.release = threading.Event()

    @override
    def objective(self, _parameter_values: Mapping[str, Scalar], /) -> float:
        self.entered.set()
        self.release.wait()
        raise PetrinautClientError("CLI closed")


class ConnectedRequest:
    def __init__(self) -> None:
        self.app = FastAPI()
        self.app.state.statuses = StatusStore()
        self.headers: dict[str, str] = {}
        self.disconnected = False

    async def is_disconnected(self) -> bool:
        return self.disconnected


class DisconnectedAfterWorkerStarts(ConnectedRequest):
    def __init__(self, model: StubbornModel) -> None:
        super().__init__()
        self.model = model

    @override
    async def is_disconnected(self) -> bool:
        await asyncio.to_thread(self.model.entered.wait, 1)
        return True


def _run_id(request: ConnectedRequest) -> str:
    return request.app.state.statuses.create().run_id


def _with_single_trial(description: dict[str, JsonValue]) -> dict[str, JsonValue]:
    """Return a copy of the description whose study runs exactly one trial."""
    study = description["study"]
    assert isinstance(study, dict)
    return {**description, "study": {**study, "trials": 1}}


def test_maps_float_integer_step_and_boolean_descriptors_to_optuna(
    optimization_description: dict[str, JsonValue],
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)
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
    assert isinstance(distributions["enabled"], optuna.distributions.CategoricalDistribution)
    assert distributions["enabled"].choices == (False, True)


def test_objective_sends_only_flat_suggested_values(
    optimization_description: dict[str, JsonValue],
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    assert optimizer.objective(trial) == pytest.approx(10.25)
    assert model.evaluations == [{"rate": 1.25, "count": 8, "enabled": True}]


def test_objective_prunes_only_evaluation_errors(
    optimization_description: dict[str, JsonValue],
    caplog: pytest.LogCaptureFixture,
) -> None:
    sensitive_detail = "secret user-authored expression"
    model = FailingModel(optimization_description, PetrinautRunError(sensitive_detail))
    optimizer = PetrinautOptimizer(model)
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    with (
        caplog.at_level(logging.WARNING, logger="pn_optimize"),
        pytest.raises(optuna.TrialPruned),
    ):
        optimizer.objective(trial)

    record = next(record for record in caplog.records if "pruned" in record.getMessage())
    assert sensitive_detail not in record.getMessage()
    assert vars(record)["error_type"] == "PetrinautRunError"


def test_objective_propagates_transport_errors(
    optimization_description: dict[str, JsonValue],
) -> None:
    model = FailingModel(optimization_description, PetrinautClientError("transport failed"))
    optimizer = PetrinautOptimizer(model)
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    with pytest.raises(PetrinautClientError, match="transport failed"):
        optimizer.objective(trial)


def test_uses_the_cli_supplied_seed_for_deterministic_sampling(
    optimization_description: dict[str, JsonValue],
) -> None:
    first = PetrinautOptimizer(FakeModel(optimization_description))
    second = PetrinautOptimizer(FakeModel(optimization_description))

    assert first.suggest(first.study.ask()) == second.suggest(second.study.ask())


@pytest.mark.parametrize(
    "change",
    [
        {"direction": "up"},
        {"study": {"trials": 0, "sampler": "random", "seed": 42}},
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
def test_rejects_invalid_cli_descriptions(
    optimization_description: dict[str, JsonValue],
    change: dict[str, JsonValue],
) -> None:
    optimization_description.update(change)

    with pytest.raises(ValidationError):
        PetrinautOptimizer(FakeModel(optimization_description))


def test_stream_all_logs_the_study_lifecycle_with_correlation(
    optimization_description: dict[str, JsonValue],
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)
    request = ConnectedRequest()
    request.headers = {"x-hash-request-id": "request-s1"}
    run_id = _run_id(request)

    async def consume() -> None:
        async for _frame in optimizer.stream_all(request, run_id, optimizer.n_trials):
            pass

    with caplog.at_level(logging.INFO, logger="pn_optimize"):
        asyncio.run(consume())

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


def test_disconnect_is_logged_with_the_run_id(
    optimization_description: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(petrinaut_optimizer, "_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    model = StubbornModel(_with_single_trial(optimization_description))
    optimizer = PetrinautOptimizer(model)
    request = DisconnectedAfterWorkerStarts(model)
    run_id = _run_id(request)

    async def consume() -> None:
        async for _frame in optimizer.stream_all(request, run_id, optimizer.n_trials):
            pass
        model.release.set()
        await asyncio.sleep(0.05)

    with caplog.at_level(logging.INFO, logger="pn_optimize"):
        asyncio.run(consume())

    disconnected = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "client_disconnected"
    )
    assert vars(disconnected)["run_id"] == run_id


def test_stream_all_preserves_the_existing_sse_frame_shape(
    optimization_description: dict[str, JsonValue],
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)
    request = ConnectedRequest()

    async def collect() -> list[str]:
        return [
            frame
            async for frame in optimizer.stream_all(request, _run_id(request), optimizer.n_trials)
        ]

    frames = asyncio.run(collect())
    data = [
        json.loads(frame.removeprefix("data: ")) for frame in frames if frame.startswith("data: ")
    ]

    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert len(data) == 3
    assert all(
        set(payload) == {"step", "params", "init_state", "metric", "state"} for payload in data
    )
    assert all(payload["init_state"] == {} for payload in data)
    assert all(set(payload["params"]) == {"rate", "count", "enabled"} for payload in data)
    assert model.closed is True
    assert model.close_calls == [True]


def test_stream_best_preserves_the_existing_sse_frame_shape(
    optimization_description: dict[str, JsonValue],
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)
    request = ConnectedRequest()

    async def collect() -> list[str]:
        return [
            frame
            async for frame in optimizer.stream_best(request, _run_id(request), optimizer.n_trials)
        ]

    frames = asyncio.run(collect())
    data = [
        json.loads(frame.removeprefix("data: ")) for frame in frames if frame.startswith("data: ")
    ]

    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert len(data) == 3
    assert all(payload["state"] == "COMPLETE" for payload in data)
    assert all(payload["init_state"] == {} for payload in data)
    assert model.closed is True
    assert model.close_calls == [True]


def test_stream_sends_comment_heartbeats_while_a_trial_is_running(
    optimization_description: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(petrinaut_optimizer, "SSE_HEARTBEAT_SECONDS", 0.01)
    model = SlowModel(_with_single_trial(optimization_description))
    optimizer = PetrinautOptimizer(model)
    request = ConnectedRequest()

    async def collect() -> list[str]:
        return [
            frame
            async for frame in optimizer.stream_all(request, _run_id(request), optimizer.n_trials)
        ]

    frames = asyncio.run(collect())

    assert ": heartbeat\n\n" in frames
    assert frames[-1] == "event: done\ndata: {}\n\n"


@pytest.mark.parametrize("stream_name", ["stream_all", "stream_best"])
def test_stream_error_is_terminal_and_is_not_followed_by_done(
    optimization_description: dict[str, JsonValue],
    stream_name: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    model = FailingModel(optimization_description, PetrinautClientError("transport failed"))
    optimizer = PetrinautOptimizer(model)
    request = ConnectedRequest()
    run_id = _run_id(request)

    async def collect() -> list[str]:
        stream = getattr(optimizer, stream_name)
        return [frame async for frame in stream(request, run_id, optimizer.n_trials)]

    with caplog.at_level(logging.WARNING, logger="pn_optimize"):
        frames = asyncio.run(collect())
    status = request.app.state.statuses.get(run_id)

    assert any(
        json.loads(frame.removeprefix("data: "))
        == {"state": "ERROR", "message": "transport failed"}
        for frame in frames
        if frame.startswith("data: ")
    )
    assert "event: done\ndata: {}\n\n" not in frames
    assert status is not None
    assert status.phase is Phase.error
    assert model.closed is True
    assert model.close_calls == [False]
    failure = next(
        record for record in caplog.records if getattr(record, "event", None) == "study_failed"
    )
    assert vars(failure)["run_id"] == run_id
    assert "transport failed" not in failure.getMessage()
    assert not hasattr(failure, "detail")


def test_disconnect_closes_cli_before_a_bounded_worker_join(
    optimization_description: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(petrinaut_optimizer, "_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    model = StubbornModel(_with_single_trial(optimization_description))
    optimizer = PetrinautOptimizer(model)
    request = DisconnectedAfterWorkerStarts(model)
    run_id = _run_id(request)

    async def collect() -> list[str]:
        started_at = time.monotonic()
        frames = [
            frame async for frame in optimizer.stream_all(request, run_id, optimizer.n_trials)
        ]
        assert time.monotonic() - started_at < 0.5
        model.release.set()
        await asyncio.sleep(0.05)
        return frames

    frames = asyncio.run(collect())
    status = request.app.state.statuses.get(run_id)

    assert frames == []
    assert model.closed is True
    assert model.close_calls == [False]
    assert status is not None
    assert status.phase is Phase.idle
