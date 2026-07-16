from __future__ import annotations

import asyncio
import threading
from typing import Any

import pytest

from src.optimization_models import (
    OptimizationCompleteEvent,
    OptimizationErrorEvent,
    OptimizationInput,
    OptimizationStartedEvent,
    OptimizationTrialEvent,
)
from src.petrinaut_client import (
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)
from src.petrinaut_optimizer import PetrinautOptimizer


class ConnectedRequest:
    async def is_disconnected(self) -> bool:
        return False


class DisconnectedRequest:
    async def is_disconnected(self) -> bool:
        return True


class FakeClient:
    def __init__(self) -> None:
        self.started = False
        self.closed = False
        self.runs: list[dict[str, Any]] = []

    def start(self) -> None:
        self.started = True

    def run_scenario(self, **request: Any) -> float:
        self.runs.append(request)
        return float(request["parameter_values"]["rate"])

    def close(self) -> None:
        self.closed = True


class BlockingClient(FakeClient):
    def __init__(self) -> None:
        super().__init__()
        self.released = threading.Event()

    def run_scenario(self, **request: Any) -> float:
        self.released.wait(timeout=5)
        raise PetrinautClientError("closed")

    def close(self) -> None:
        self.closed = True
        self.released.set()


class MixedDomainClient(FakeClient):
    def run_scenario(self, **request: Any) -> float:
        self.runs.append(request)
        values = request["parameter_values"]
        return float(values["count"] + int(values["enabled"]))


class StartFailingClient(FakeClient):
    def start(self) -> None:
        raise PetrinautClientError("could not compile model")


class RecoverableTrialFailingClient(FakeClient):
    def __init__(self, failures: int = 1) -> None:
        super().__init__()
        self.failures = failures

    def run_scenario(self, **request: Any) -> float:
        self.runs.append(request)
        if len(self.runs) <= self.failures:
            raise PetrinautRunError("scenario execution failed")
        return float(request["parameter_values"]["rate"])


class FatalTrialFailingClient(FakeClient):
    def __init__(self, error: PetrinautClientError) -> None:
        super().__init__()
        self.error = error

    def run_scenario(self, **request: Any) -> float:
        self.runs.append(request)
        raise self.error


def test_streams_trials_and_a_final_summary(optimization_payload: dict) -> None:
    optimization_input = OptimizationInput.model_validate(optimization_payload)
    client = FakeClient()
    optimizer = PetrinautOptimizer(optimization_input, client)  # type: ignore[arg-type]

    async def collect():
        return [event async for event in optimizer.stream(ConnectedRequest())]

    events = asyncio.run(collect())

    assert isinstance(events[0], OptimizationStartedEvent)
    trial_events = [event for event in events if isinstance(event, OptimizationTrialEvent)]
    assert len(trial_events) == 3
    assert all(set(event.parameters) == {"rate"} for event in trial_events)
    assert all(event.state == "complete" for event in trial_events)
    assert isinstance(events[-1], OptimizationCompleteEvent)
    assert events[-1].completed_trials == 3
    assert events[-1].best is not None
    assert client.started is True
    assert client.closed is True
    assert all(
        set(run["parameter_values"]) == {"rate", "count", "enabled", "share"}
        for run in client.runs
    )


def test_disconnect_closes_the_cli_and_stops_the_study(optimization_payload: dict) -> None:
    optimization_input = OptimizationInput.model_validate(optimization_payload)
    client = BlockingClient()
    optimizer = PetrinautOptimizer(optimization_input, client)  # type: ignore[arg-type]

    async def collect():
        return [event async for event in optimizer.stream(DisconnectedRequest())]

    events = asyncio.run(collect())

    assert len(events) == 1
    assert isinstance(events[0], OptimizationStartedEvent)
    assert client.closed is True


def test_materializes_integer_and_boolean_domains(optimization_payload: dict) -> None:
    optimization_payload["searchSpace"]["variables"] = [
        {
            "identifier": "count",
            "domain": {"kind": "integer", "minimum": 2, "maximum": 6, "step": 2},
        },
        {
            "identifier": "enabled",
            "domain": {"kind": "categorical", "values": [False, True]},
        },
    ]
    optimization_payload["optimization"]["trials"] = 4
    optimization_input = OptimizationInput.model_validate(optimization_payload)
    client = MixedDomainClient()
    optimizer = PetrinautOptimizer(optimization_input, client)  # type: ignore[arg-type]

    async def collect():
        return [event async for event in optimizer.stream(ConnectedRequest())]

    events = asyncio.run(collect())
    trial_events = [event for event in events if isinstance(event, OptimizationTrialEvent)]

    assert len(trial_events) == 4
    assert all(event.parameters["count"] in {2, 4, 6} for event in trial_events)
    assert all(isinstance(event.parameters["enabled"], bool) for event in trial_events)
    assert all(
        set(run["parameter_values"]) == {"rate", "count", "enabled", "share"}
        for run in client.runs
    )


def test_reports_a_typed_startup_error(optimization_payload: dict) -> None:
    optimization_input = OptimizationInput.model_validate(optimization_payload)
    client = StartFailingClient()
    optimizer = PetrinautOptimizer(optimization_input, client)  # type: ignore[arg-type]

    async def collect():
        return [event async for event in optimizer.stream(ConnectedRequest())]

    events = asyncio.run(collect())

    assert events == [
        OptimizationErrorEvent(
            type="error",
            code="petrinaut_start_failed",
            message="could not compile model",
            retryable=False,
        )
    ]
    assert client.closed is True


def test_continues_after_a_recoverable_trial_failure(
    optimization_payload: dict,
) -> None:
    optimization_input = OptimizationInput.model_validate(optimization_payload)
    client = RecoverableTrialFailingClient()
    optimizer = PetrinautOptimizer(optimization_input, client)  # type: ignore[arg-type]

    async def collect():
        return [event async for event in optimizer.stream(ConnectedRequest())]

    events = asyncio.run(collect())
    trial_events = [event for event in events if isinstance(event, OptimizationTrialEvent)]

    assert [event.state for event in trial_events] == ["failed", "complete", "complete"]
    assert trial_events[0].objective is None
    assert trial_events[0].best is None
    assert isinstance(events[-1], OptimizationCompleteEvent)
    assert events[-1].completed_trials == 2
    assert events[-1].failed_trials == 1
    assert events[-1].best is not None
    assert len(client.runs) == 3


def test_completes_without_a_best_when_every_trial_fails(
    optimization_payload: dict,
) -> None:
    optimization_input = OptimizationInput.model_validate(optimization_payload)
    client = RecoverableTrialFailingClient(
        failures=optimization_input.optimization.trials
    )
    optimizer = PetrinautOptimizer(optimization_input, client)  # type: ignore[arg-type]

    async def collect():
        return [event async for event in optimizer.stream(ConnectedRequest())]

    events = asyncio.run(collect())
    trial_events = [
        event for event in events if isinstance(event, OptimizationTrialEvent)
    ]

    assert len(trial_events) == optimization_input.optimization.trials
    assert all(event.state == "failed" for event in trial_events)
    assert isinstance(events[-1], OptimizationCompleteEvent)
    assert events[-1].completed_trials == 0
    assert events[-1].failed_trials == optimization_input.optimization.trials
    assert events[-1].best is None
    assert len(client.runs) == optimization_input.optimization.trials


@pytest.mark.parametrize(
    ("error", "expected_code"),
    [
        (PetrinautClientError("CLI exited"), "petrinaut_transport_failed"),
        (
            PetrinautProtocolError("invalid response"),
            "petrinaut_protocol_failed",
        ),
    ],
)
def test_stops_immediately_after_a_fatal_cli_failure(
    optimization_payload: dict,
    error: PetrinautClientError,
    expected_code: str,
) -> None:
    optimization_input = OptimizationInput.model_validate(optimization_payload)
    client = FatalTrialFailingClient(error)
    optimizer = PetrinautOptimizer(optimization_input, client)  # type: ignore[arg-type]

    async def collect():
        return [event async for event in optimizer.stream(ConnectedRequest())]

    events = asyncio.run(collect())
    trial_events = [event for event in events if isinstance(event, OptimizationTrialEvent)]

    assert trial_events == []
    assert isinstance(events[-1], OptimizationErrorEvent)
    assert events[-1].code == expected_code
    assert len(client.runs) == 1
