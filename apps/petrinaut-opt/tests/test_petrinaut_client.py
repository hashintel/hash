from __future__ import annotations

import io
import json
import sys
import time
from typing import Any

import pytest

from src.optimization_models import OptimizationInput
from src import petrinaut_client
from src.petrinaut_client import (
    PetrinautClient,
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)


class FakeProcess:
    def __init__(
        self, response: dict[str, Any] | list[dict[str, Any]]
    ) -> None:
        responses = response if isinstance(response, list) else [response]
        self.stdin = io.BytesIO()
        self.stdout = io.BytesIO(
            b"".join((json.dumps(item) + "\n").encode() for item in responses)
        )
        self.stderr = io.BytesIO(b"Petrinaut stdio ready for stdin model\n")
        self.returncode: int | None = None
        self.terminated = False
        self.killed = False

    def poll(self) -> int | None:
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        self.returncode = 0
        return 0

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = -15

    def kill(self) -> None:
        self.killed = True
        self.returncode = -9


def test_bootstraps_model_stdin_and_sends_a_scenario_run(
    optimization_payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "must-not-leak")
    monkeypatch.setenv("HASH_GRAPH_OPENAI_API_KEY", "must-not-leak")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_HEADERS", "must-not-leak")
    monkeypatch.setenv(
        "PETRINAUT_CLI_NODE_OPTIONS", "--permission --max-old-space-size=768"
    )
    parsed = OptimizationInput.model_validate(optimization_payload)
    process = FakeProcess({"id": 1, "result": {"metrics": {"profit": 12.5}}})
    invocation: dict[str, Any] = {}

    def popen_factory(command: list[str], **kwargs: Any) -> FakeProcess:
        invocation["command"] = command
        invocation["kwargs"] = kwargs
        return process

    client = PetrinautClient(
        parsed.model,
        command=("node", "/cli.js"),
        popen_factory=popen_factory,
    )
    client.start()
    objective = client.run_scenario(
        scenario_id=parsed.scenario.id,
        parameter_values=parsed.scenario.parameter_values,
        metric_id=parsed.objective.metric_id,
        max_time=parsed.execution.max_time,
        dt=parsed.execution.dt,
        seed=parsed.execution.seed,
    )

    assert invocation["command"] == [
        "node",
        "/cli.js",
        "serve",
        "--model-stdin",
        "--stdio",
    ]
    assert invocation["kwargs"]["close_fds"] is True
    assert invocation["kwargs"]["start_new_session"] is True
    assert invocation["kwargs"]["umask"] == 0o077
    child_environment = invocation["kwargs"]["env"]
    assert child_environment["NODE_OPTIONS"] == (
        "--permission --max-old-space-size=768"
    )
    assert "AWS_SECRET_ACCESS_KEY" not in child_environment
    assert "HASH_GRAPH_OPENAI_API_KEY" not in child_environment
    assert "OTEL_EXPORTER_OTLP_HEADERS" not in child_environment
    bootstrap, request = [
        json.loads(line) for line in process.stdin.getvalue().splitlines()
    ]
    assert bootstrap == {
        **optimization_payload["model"]["definition"],
        "title": "Example",
    }
    assert request == {
        "id": 1,
        "method": "run",
        "params": {
            "scenario": {
                "id": "baseline",
                "parameterValues": optimization_payload["scenario"]["parameterValues"],
            },
            "metrics": ["profit"],
            "maxTime": 100,
            "dt": 0.1,
            "seed": 42,
        },
    }
    assert objective == 12.5

    client.close()
    assert process.returncode == 0


def test_distinguishes_a_recoverable_run_error(optimization_payload: dict) -> None:
    parsed = OptimizationInput.model_validate(optimization_payload)
    process = FakeProcess(
        [
            {
                "id": 1,
                "error": {
                    "code": "run_failed",
                    "message": "scenario failed",
                },
            },
            {"id": 2, "result": {"metrics": {"profit": 12.5}}},
        ]
    )
    client = PetrinautClient(parsed.model, popen_factory=lambda *_args, **_kwargs: process)
    client.start()

    with pytest.raises(PetrinautRunError, match="scenario failed"):
        client.run_scenario(
            scenario_id="baseline",
            parameter_values=parsed.scenario.parameter_values,
            metric_id="profit",
            max_time=100,
            dt=0.1,
            seed=42,
        )

    assert process.poll() is None
    assert client.run_scenario(
        scenario_id="baseline",
        parameter_values=parsed.scenario.parameter_values,
        metric_id="profit",
        max_time=100,
        dt=0.1,
        seed=42,
    ) == 12.5
    client.close()


def test_treats_a_non_finite_objective_as_a_recoverable_run_error(
    optimization_payload: dict,
) -> None:
    parsed = OptimizationInput.model_validate(optimization_payload)
    process = FakeProcess(
        [
            {"id": 1, "result": {"metrics": {"profit": None}}},
            {"id": 2, "result": {"metrics": {"profit": 12.5}}},
        ]
    )
    client = PetrinautClient(parsed.model, popen_factory=lambda *_args, **_kwargs: process)
    client.start()

    with pytest.raises(PetrinautRunError, match="not a finite number"):
        client.run_scenario(
            scenario_id="baseline",
            parameter_values=parsed.scenario.parameter_values,
            metric_id="profit",
            max_time=100,
            dt=0.1,
            seed=42,
        )

    assert client.run_scenario(
        scenario_id="baseline",
        parameter_values=parsed.scenario.parameter_values,
        metric_id="profit",
        max_time=100,
        dt=0.1,
        seed=42,
    ) == 12.5
    client.close()


def test_rejects_a_mismatched_protocol_response(optimization_payload: dict) -> None:
    parsed = OptimizationInput.model_validate(optimization_payload)
    process = FakeProcess({"id": 99, "result": {"metrics": {"profit": 12.5}}})
    client = PetrinautClient(parsed.model, popen_factory=lambda *_args, **_kwargs: process)
    client.start()

    with pytest.raises(PetrinautProtocolError, match="mismatched response id"):
        client.run_scenario(
            scenario_id="baseline",
            parameter_values=parsed.scenario.parameter_values,
            metric_id="profit",
            max_time=100,
            dt=0.1,
            seed=42,
        )

    client.close()


def test_times_out_and_terminates_a_stuck_cli(
    optimization_payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    parsed = OptimizationInput.model_validate(optimization_payload)
    monkeypatch.setattr(petrinaut_client, "PROCESS_SHUTDOWN_TIMEOUT_SECONDS", 0.1)
    script = """
import sys
import time
sys.stdin.readline()
sys.stderr.write("Petrinaut stdio ready for stdin model\\n")
sys.stderr.flush()
sys.stdin.readline()
time.sleep(60)
"""
    client = PetrinautClient(
        parsed.model,
        command=(sys.executable, "-c", script),
        request_timeout_seconds=0.05,
    )
    client.start()

    started_at = time.monotonic()
    with pytest.raises(PetrinautClientError, match="failed to communicate"):
        client.run_scenario(
            scenario_id="baseline",
            parameter_values=parsed.scenario.parameter_values,
            metric_id="profit",
            max_time=100,
            dt=0.1,
            seed=42,
        )

    assert time.monotonic() - started_at < 2
