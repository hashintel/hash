from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any

import optuna
import pytest
from fastapi import FastAPI

from src import petrinaut_optimizer
from src.petrinaut_client import PetrinautClientError, PetrinautRunError
from src.petrinaut_optimizer import PetrinautOptimizer
from src.utils import Phase, StatusStore


class FakeModel:
    eval_timeout = None

    def __init__(self, description: dict[str, Any]) -> None:
        self.description = description
        self.evaluations: list[dict[str, Any]] = []
        self.closed = False

    def describe_optimization(self) -> dict[str, Any]:
        return self.description

    def objective(self, parameter_values: dict[str, Any]) -> float:
        self.evaluations.append(parameter_values)
        return float(
            parameter_values["rate"]
            + parameter_values["count"]
            + int(parameter_values["enabled"])
        )

    def close(self) -> None:
        self.closed = True


class SlowModel(FakeModel):
    def objective(self, parameter_values: dict[str, Any]) -> float:
        time.sleep(0.04)
        return super().objective(parameter_values)


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
        raise PetrinautClientError("CLI closed")


class ConnectedRequest:
    def __init__(self) -> None:
        self.app = FastAPI()
        self.app.state.statuses = StatusStore()

    async def is_disconnected(self) -> bool:
        return False


class DisconnectedAfterWorkerStarts(ConnectedRequest):
    def __init__(self, model: StubbornModel) -> None:
        super().__init__()
        self.model = model

    async def is_disconnected(self) -> bool:
        await asyncio.to_thread(self.model.entered.wait, 1)
        return True


def _run_id(request: ConnectedRequest) -> str:
    return request.app.state.statuses.create().run_id


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
) -> None:
    model = FailingModel(optimization_description, PetrinautRunError("scenario failed"))
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    trial = optuna.trial.FixedTrial({"rate": 1.25, "count": 8, "enabled": True})

    with pytest.raises(optuna.TrialPruned):
        optimizer.objective(trial)


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


def test_uses_the_cli_supplied_seed_for_deterministic_sampling(
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
    optimization_description: dict,
    change: dict[str, Any],
) -> None:
    optimization_description.update(change)

    with pytest.raises(ValueError):
        PetrinautOptimizer(  # type: ignore[arg-type]
            FakeModel(optimization_description)
        )


def test_stream_all_preserves_the_existing_sse_frame_shape(
    optimization_description: dict,
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    request = ConnectedRequest()

    async def collect() -> list[str]:
        return [
            frame
            async for frame in optimizer.stream_all(
                request,
                _run_id(request),
                optimizer.n_trials,  # type: ignore[arg-type]
            )
        ]

    frames = asyncio.run(collect())
    data = [
        json.loads(frame.removeprefix("data: "))
        for frame in frames
        if frame.startswith("data: ")
    ]

    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert len(data) == 3
    assert all(
        set(payload) == {"step", "params", "init_state", "metric", "state"}
        for payload in data
    )
    assert all(payload["init_state"] == {} for payload in data)
    assert all(
        set(payload["params"]) == {"rate", "count", "enabled"} for payload in data
    )
    assert model.closed is True


def test_stream_best_preserves_the_existing_sse_frame_shape(
    optimization_description: dict,
) -> None:
    model = FakeModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    request = ConnectedRequest()

    async def collect() -> list[str]:
        return [
            frame
            async for frame in optimizer.stream_best(
                request,
                _run_id(request),
                optimizer.n_trials,  # type: ignore[arg-type]
            )
        ]

    frames = asyncio.run(collect())
    data = [
        json.loads(frame.removeprefix("data: "))
        for frame in frames
        if frame.startswith("data: ")
    ]

    assert frames[-1] == "event: done\ndata: {}\n\n"
    assert len(data) == 3
    assert all(payload["state"] == "COMPLETE" for payload in data)
    assert all(payload["init_state"] == {} for payload in data)
    assert model.closed is True


def test_stream_sends_comment_heartbeats_while_a_trial_is_running(
    optimization_description: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimization_description["study"]["trials"] = 1
    monkeypatch.setattr(petrinaut_optimizer, "SSE_HEARTBEAT_SECONDS", 0.01)
    model = SlowModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    request = ConnectedRequest()

    async def collect() -> list[str]:
        return [
            frame
            async for frame in optimizer.stream_all(
                request,
                _run_id(request),
                optimizer.n_trials,  # type: ignore[arg-type]
            )
        ]

    frames = asyncio.run(collect())

    assert ": heartbeat\n\n" in frames
    assert frames[-1] == "event: done\ndata: {}\n\n"


@pytest.mark.parametrize("stream_name", ["stream_all", "stream_best"])
def test_stream_error_is_terminal_and_is_not_followed_by_done(
    optimization_description: dict,
    stream_name: str,
) -> None:
    model = FailingModel(
        optimization_description, PetrinautClientError("transport failed")
    )
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    request = ConnectedRequest()
    run_id = _run_id(request)

    async def collect() -> list[str]:
        stream = getattr(optimizer, stream_name)
        return [
            frame
            async for frame in stream(
                request,
                run_id,
                optimizer.n_trials,  # type: ignore[arg-type]
            )
        ]

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


def test_disconnect_closes_cli_before_a_bounded_worker_join(
    optimization_description: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimization_description["study"]["trials"] = 1
    monkeypatch.setattr(petrinaut_optimizer, "_WORKER_SHUTDOWN_TIMEOUT_SECONDS", 0.01)
    model = StubbornModel(optimization_description)
    optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
    request = DisconnectedAfterWorkerStarts(model)
    run_id = _run_id(request)

    async def collect() -> list[str]:
        started_at = time.monotonic()
        frames = [
            frame
            async for frame in optimizer.stream_all(
                request,
                run_id,
                optimizer.n_trials,  # type: ignore[arg-type]
            )
        ]
        assert time.monotonic() - started_at < 0.5
        model.release.set()
        await asyncio.sleep(0.05)
        return frames

    frames = asyncio.run(collect())
    status = request.app.state.statuses.get(run_id)

    assert frames == []
    assert model.closed is True
    assert status is not None
    assert status.phase is Phase.idle
