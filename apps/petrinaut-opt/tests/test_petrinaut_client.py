from __future__ import annotations

import io
import json
import signal
import subprocess
import sys
import threading
import time
from typing import Any

import pytest

from src import petrinaut_client
from src.petrinaut_client import (
    PetrinautClientError,
    PetrinautModel,
    PetrinautProtocolError,
    PetrinautRunError,
)


class FakeProcess:
    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self.stdin = io.BytesIO()
        self.stdout = io.BytesIO(
            "".join(json.dumps(response) + "\n" for response in responses).encode()
        )
        self.stderr = io.BytesIO(b"Petrinaut stdio ready for optimization\n")
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


def test_bootstraps_an_opaque_manifest_and_uses_optimization_methods(
    optimization_manifest: dict,
    optimization_description: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "must-not-leak")
    monkeypatch.setenv("PETRINAUT_CLI_NODE_OPTIONS", "--max-old-space-size=768")
    process = FakeProcess(
        [
            {"id": 1, "result": optimization_description},
            {"id": 2, "result": {"objective": 12.5}},
        ]
    )
    invocation: dict[str, Any] = {}

    def popen_factory(command: list[str], **kwargs: Any) -> FakeProcess:
        invocation["command"] = command
        invocation["kwargs"] = kwargs
        return process

    model = PetrinautModel(
        optimization_manifest,
        command=("node", "/cli.js"),
        popen_factory=popen_factory,
    )
    model.start()

    assert model.describe_optimization() == optimization_description
    assert model.objective({"rate": 1.25, "count": 6, "enabled": False}) == 12.5
    lines = [json.loads(line) for line in process.stdin.getvalue().splitlines()]

    assert invocation["command"] == [
        "node",
        "/cli.js",
        "serve",
        "--optimization-stdin",
        "--stdio",
    ]
    assert invocation["kwargs"]["close_fds"] is True
    assert invocation["kwargs"]["start_new_session"] is True
    assert invocation["kwargs"]["env"]["NODE_OPTIONS"] == ("--max-old-space-size=768")
    assert "AWS_SECRET_ACCESS_KEY" not in invocation["kwargs"]["env"]
    assert lines == [
        optimization_manifest,
        {"id": 1, "method": "optimization.describe"},
        {
            "id": 2,
            "method": "optimization.evaluate",
            "params": {
                "parameterValues": {
                    "rate": 1.25,
                    "count": 6,
                    "enabled": False,
                }
            },
        },
    ]

    model.close()
    assert process.returncode == 0


def test_bootstrap_and_protocol_reads_use_bounded_defaults(
    optimization_manifest: dict,
) -> None:
    model = PetrinautModel(optimization_manifest)

    assert model._bootstrap_timeout_seconds == 25
    assert model._request_timeout_seconds == 240


def test_bootstrap_timeout_terminates_a_stuck_process(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(petrinaut_client, "PROCESS_SHUTDOWN_TIMEOUT_SECONDS", 0.05)
    script = "import sys, time; sys.stdin.readline(); time.sleep(60)"
    model = PetrinautModel(
        optimization_manifest,
        command=(sys.executable, "-c", script),
        bootstrap_timeout_seconds=0.05,
    )

    started_at = time.monotonic()
    with pytest.raises(PetrinautClientError, match="failed to bootstrap"):
        model.start()

    assert time.monotonic() - started_at < 2


def test_protocol_timeout_terminates_a_stuck_process(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(petrinaut_client, "PROCESS_SHUTDOWN_TIMEOUT_SECONDS", 0.05)
    script = """
import sys
import time
sys.stdin.readline()
sys.stderr.write("Petrinaut stdio ready for optimization\\n")
sys.stderr.flush()
sys.stdin.readline()
time.sleep(60)
"""
    model = PetrinautModel(
        optimization_manifest,
        command=(sys.executable, "-c", script),
        request_timeout_seconds=0.05,
    )
    model.start()

    started_at = time.monotonic()
    with pytest.raises(PetrinautClientError, match="failed to communicate"):
        model.describe_optimization()

    assert time.monotonic() - started_at < 2


def test_rejects_an_oversized_protocol_line(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = FakeProcess([])
    process.stdout = io.BytesIO(b'{"id":1,"result":{}}\n')
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()
    monkeypatch.setattr(petrinaut_client, "MAX_PROTOCOL_LINE_BYTES", 8)

    with pytest.raises(PetrinautProtocolError, match="line limit"):
        model.describe_optimization()

    assert process.returncode == 0
    model.close()


def test_drains_stderr_after_the_ready_line(
    optimization_manifest: dict,
) -> None:
    drained = threading.Event()

    class TrackingStream(io.BytesIO):
        def read(self, size: int = -1) -> bytes:
            drained.set()
            return super().read(size)

    process = FakeProcess([])
    process.stderr = TrackingStream(
        b"Petrinaut stdio ready for optimization\ndiagnostic\n"
    )
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )

    model.start()

    assert drained.wait(timeout=1)
    model.close()


def test_close_signals_the_isolated_process_group(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = FakeProcess([])
    process.pid = 12345

    def wait(*, timeout: float | None = None) -> int:
        raise subprocess.TimeoutExpired("petrinaut", timeout)

    process.wait = wait  # type: ignore[method-assign]
    signals: list[tuple[int, signal.Signals]] = []
    monkeypatch.setattr(
        petrinaut_client.os,
        "killpg",
        lambda pid, sent_signal: signals.append((pid, sent_signal)),
    )
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    model.close()

    assert signals == [
        (process.pid, signal.SIGTERM),
        (process.pid, signal.SIGKILL),
    ]


def test_cli_error_during_evaluation_is_recoverable(
    optimization_manifest: dict,
) -> None:
    process = FakeProcess(
        [
            {"id": 1, "error": {"message": "scenario failed"}},
            {"id": 2, "result": {"objective": 7}},
        ]
    )
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautRunError, match="scenario failed"):
        model.objective({"rate": 1})

    assert model.objective({"rate": 2}) == 7.0
    model.close()


@pytest.mark.parametrize("objective", [True, None, float("inf")])
def test_rejects_a_non_finite_numeric_objective(
    optimization_manifest: dict,
    objective: Any,
) -> None:
    process = FakeProcess([{"id": 1, "result": {"objective": objective}}])
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautRunError, match="not a finite number"):
        model.objective({"rate": 1})

    model.close()


def test_rejects_a_mismatched_protocol_response(
    optimization_manifest: dict,
) -> None:
    process = FakeProcess([{"id": 99, "result": {"objective": 12.5}}])
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautProtocolError, match="mismatched response id"):
        model.objective({"rate": 1})

    assert process.returncode == 0
    model.close()
