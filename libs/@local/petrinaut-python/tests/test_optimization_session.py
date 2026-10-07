import io
import json
import signal
import subprocess  # ruff: ignore[suspicious-subprocess-import] - Use real TimeoutExpired to test fake-process shutdown escalation.
import sys
import threading
import time
from typing import override

import pytest
from pydantic import JsonValue

import petrinaut._transport
from petrinaut import (
    OptimizationDescribeResult,
    OptimizationEvaluateResult,
    OptimizationSession,
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)

from ._process_support import FakeProcess, ProcessInvocation


def test_manifest_routes_methods(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "must-not-leak")
    monkeypatch.setenv("PETRINAUT_CHILD_NODE_OPTIONS", "--max-old-space-size=768")
    process = FakeProcess([
        {"id": 1, "result": optimization_description},
        {"id": 2, "result": {"objective": 12.5}},
    ])
    invocation = ProcessInvocation(process)

    model = OptimizationSession(
        optimization_manifest,
        command=("node", "/cli.js"),
        popen_factory=invocation,
    )
    model.start()

    assert model.describe() == OptimizationDescribeResult.model_validate(optimization_description)
    # The previous name stays as an alias.
    assert OptimizationSession.describe_optimization is OptimizationSession.describe
    assert model.objective({"rate": 1.25, "count": 6, "enabled": False}).as_integer_ratio() == (
        25,
        2,
    )
    lines = [json.loads(line) for line in process.stdin.getvalue().splitlines()]

    assert invocation.command == [
        "node",
        "/cli.js",
        "serve",
        "--optimization-stdin",
        "--stdio",
    ]
    assert invocation.kwargs["close_fds"] is True
    assert invocation.kwargs["start_new_session"] is True
    env = invocation.kwargs["env"]
    assert isinstance(env, dict)
    assert env["NODE_OPTIONS"] == "--max-old-space-size=768"
    assert "AWS_SECRET_ACCESS_KEY" not in env
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


def test_manifest_file(
    optimization_description: dict[str, JsonValue],
) -> None:
    process = FakeProcess([{"id": 1, "result": optimization_description}])
    invocation = ProcessInvocation(process)
    session = OptimizationSession(
        manifest_path="./optimize.json",
        popen_factory=invocation,
    )
    session.start()

    assert session.describe() == OptimizationDescribeResult.model_validate(optimization_description)
    assert invocation.command == [
        "petrinaut",
        "serve",
        "--optimization",
        "./optimize.json",
        "--stdio",
    ]
    lines = process.stdin.getvalue().splitlines()
    assert json.loads(lines[0]) == {"id": 1, "method": "optimization.describe"}
    session.close()


def test_manifest_factories(
    optimization_manifest: dict[str, JsonValue],
) -> None:
    """Both classes construct the same way: name the source, get the session."""
    from_file = ProcessInvocation(FakeProcess([]))
    session = OptimizationSession.from_manifest_file("./optimize.json", popen_factory=from_file)
    session.start()
    assert from_file.command == [
        "petrinaut",
        "serve",
        "--optimization",
        "./optimize.json",
        "--stdio",
    ]
    session.close()

    from_object = ProcessInvocation(FakeProcess([]))
    session = OptimizationSession.from_manifest(optimization_manifest, popen_factory=from_object)
    session.start()
    assert from_object.command == [
        "petrinaut",
        "serve",
        "--optimization-stdin",
        "--stdio",
    ]
    session.close()


def test_manifest_ambiguous_source(
    optimization_manifest: dict[str, JsonValue],
) -> None:
    with pytest.raises(ValueError, match="exactly one"):
        OptimizationSession(optimization_manifest, manifest_path="./optimize.json")
    with pytest.raises(ValueError, match="exactly one"):
        OptimizationSession()


def test_evaluate_replicates(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
) -> None:
    full_result = {
        "objective": 12.5,
        "replicates": [
            {"seed": 42, "objective": 12.0},
            {"seed": 7, "objective": 13.0},
        ],
    }
    # The first evaluate describes once to scale the response deadline.
    process = FakeProcess([
        {"id": 1, "result": optimization_description},
        {"id": 2, "result": full_result},
    ])
    invocation = ProcessInvocation(process)
    session = OptimizationSession(optimization_manifest, popen_factory=invocation)
    session.start()

    result = session.evaluate({"rate": 1.25})
    assert result == OptimizationEvaluateResult.model_validate(full_result)
    assert result.replicates is not None
    assert result.replicates[1].seed == 7
    session.close()


def test_bootstrap_timeout(
    optimization_manifest: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(petrinaut._transport, "PROCESS_SHUTDOWN_TIMEOUT_SECONDS", 0.05)
    script = "import sys, time; sys.stdin.readline(); time.sleep(60)"
    model = OptimizationSession(
        optimization_manifest,
        command=(sys.executable, "-c", script),
        bootstrap_timeout_seconds=0.05,
    )

    started_at = time.monotonic()
    with pytest.raises(PetrinautClientError, match="failed to bootstrap"):
        model.start()

    assert time.monotonic() - started_at < 2
    assert model._transport._process is None


def test_protocol_timeout(
    optimization_manifest: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(petrinaut._transport, "PROCESS_SHUTDOWN_TIMEOUT_SECONDS", 0.05)
    script = """
import sys
import time
sys.stdin.readline()
sys.stderr.write("Petrinaut stdio ready for optimization\\n")
sys.stderr.flush()
sys.stdin.readline()
time.sleep(60)
"""
    model = OptimizationSession(
        optimization_manifest,
        command=(sys.executable, "-c", script),
        request_timeout_seconds=0.05,
    )
    model.start()

    started_at = time.monotonic()
    process = model._transport._process
    assert process is not None
    # The deadline names itself rather than collapsing into a generic
    # transport failure, so an operator can tell a stall from a broken pipe.
    with pytest.raises(PetrinautClientError, match="protocol response timed out"):
        model.describe()

    assert time.monotonic() - started_at < 2
    assert process.poll() is not None
    assert model._transport._process is None


def test_protocol_oversized_line(
    optimization_manifest: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = FakeProcess([])
    process.stdout = io.BytesIO(b'{"id":1,"result":{}}\n')
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()
    monkeypatch.setattr(petrinaut._transport, "MAX_PROTOCOL_LINE_BYTES", 8)

    with pytest.raises(PetrinautProtocolError, match="line limit"):
        model.describe()

    assert process.returncode == 0
    model.close()


def test_stderr_drain(
    optimization_manifest: dict[str, JsonValue],
) -> None:
    drained = threading.Event()

    class TrackingStream(io.BytesIO):
        @override
        def read(self, size: int | None = -1, /) -> bytes:
            drained.set()
            return super().read(size)

    process = FakeProcess([])
    process.stderr = TrackingStream(b"Petrinaut stdio ready for optimization\ndiagnostic\n")
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )

    model.start()

    assert drained.wait(timeout=1)
    model.close()


def test_close_process_group(
    optimization_manifest: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class StuckProcess(FakeProcess):
        @override
        def wait(self, timeout: float | None = None) -> int:
            assert timeout is not None
            raise subprocess.TimeoutExpired("petrinaut", timeout)

    process = StuckProcess([])
    process.pid = 12345
    signals: list[tuple[int, signal.Signals]] = []
    monkeypatch.setattr(
        petrinaut._transport.os,
        "killpg",
        lambda pid, sent_signal: signals.append((pid, sent_signal)),
    )
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    model.close()

    assert signals == [
        (process.pid, signal.SIGTERM),
        (process.pid, signal.SIGKILL),
    ]


def test_close_signals_before_wait(
    optimization_manifest: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []

    class OrderedProcess(FakeProcess):
        @override
        def wait(self, timeout: float | None = None) -> int:
            assert timeout is not None
            events.append("wait")
            self.returncode = -signal.SIGTERM
            return self.returncode

    process = OrderedProcess([])
    process.pid = 12345
    monkeypatch.setattr(
        petrinaut._transport.os,
        "killpg",
        lambda _pid, sent_signal: events.append(f"killpg:{signal.Signals(sent_signal).name}"),
    )
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    model.close(graceful=False)

    assert events == ["killpg:SIGTERM", "wait"]


def test_close_busy_child(
    optimization_manifest: dict[str, JsonValue],
) -> None:
    """A mid-trial CLI never notices stdin EOF, so cancellation must signal."""
    script = """
import sys
import time
sys.stdin.readline()
sys.stderr.write("Petrinaut stdio ready for optimization\\n")
sys.stderr.flush()
while True:
    time.sleep(0.1)
"""
    model = OptimizationSession(
        optimization_manifest,
        command=(sys.executable, "-c", script),
    )
    model.start()

    process = model._transport._process
    assert process is not None
    started_at = time.monotonic()
    model.close(graceful=False)

    assert time.monotonic() - started_at < 2
    assert process.poll() is not None
    assert model._transport._process is None


def test_evaluation_error_recovery(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
) -> None:
    process = FakeProcess([
        {"id": 1, "result": optimization_description},
        {"id": 2, "error": {"message": "scenario failed"}},
        {"id": 3, "result": {"objective": 7}},
    ])
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautRunError, match="scenario failed"):
        model.objective({"rate": 1})

    assert model.objective({"rate": 2}) == 7
    model.close()


@pytest.mark.parametrize("objective", [True, None, "12.5"])
def test_objective_nonnumeric(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
    objective: JsonValue,
) -> None:
    """A result outside the protocol schema closes the session."""
    process = FakeProcess([
        {"id": 1, "result": optimization_description},
        {"id": 2, "result": {"objective": objective}},
    ])
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautProtocolError, match="protocol schema"):
        model.objective({"rate": 1})
    with pytest.raises(PetrinautClientError, match="not running"):
        model.objective({"rate": 1})


def test_objective_nonfinite(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
) -> None:
    """JSON cannot carry Infinity, but Python's parser admits it; refuse it."""
    process = FakeProcess([
        {"id": 1, "result": optimization_description},
        {"id": 2, "result": {"objective": float("inf")}},
    ])
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautRunError, match="not a finite number"):
        model.objective({"rate": 1})

    model.close()


def test_response_mismatched_id(
    optimization_manifest: dict[str, JsonValue],
) -> None:
    process = FakeProcess([{"id": 99, "result": {"objective": 12.5}}])
    model = OptimizationSession(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautProtocolError, match="mismatched response id"):
        model.objective({"rate": 1})

    assert process.returncode == 0
    model.close()


def test_timeout_seed_count(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
) -> None:
    assert isinstance(optimization_description["study"], dict)
    description = {
        **optimization_description,
        "study": {**optimization_description["study"], "seedsPerTrial": 5},
    }
    process = FakeProcess([{"id": 1, "result": description}])
    model = OptimizationSession(
        optimization_manifest,
        command=("node", "/cli.js"),
        popen_factory=ProcessInvocation(process),
        request_timeout_seconds=240,
    )
    model.start()

    assert model.describe() == OptimizationDescribeResult.model_validate(description)
    assert model._transport.request_timeout_seconds == 1200
    model.close()


def test_evaluate_scales_timeout(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
) -> None:
    assert isinstance(optimization_description["study"], dict)
    description = {
        **optimization_description,
        "study": {**optimization_description["study"], "seedsPerTrial": 5},
    }
    process = FakeProcess([
        {"id": 1, "result": description},
        {"id": 2, "result": {"objective": 1.5}},
    ])
    model = OptimizationSession(
        optimization_manifest,
        command=("node", "/cli.js"),
        popen_factory=ProcessInvocation(process),
        request_timeout_seconds=240,
    )
    model.start()

    assert model.evaluate({"rate": 1.0}).objective.as_integer_ratio() == (3, 2)
    assert model._transport.request_timeout_seconds == 1200
    model.close()


def test_description_invalid_seed_count(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
) -> None:
    assert isinstance(optimization_description["study"], dict)
    description = {
        **optimization_description,
        "study": {**optimization_description["study"], "seedsPerTrial": 0},
    }
    process = FakeProcess([{"id": 1, "result": description}])
    model = OptimizationSession(
        optimization_manifest,
        command=("node", "/cli.js"),
        popen_factory=ProcessInvocation(process),
    )
    model.start()

    with pytest.raises(PetrinautProtocolError, match="seedsPerTrial"):
        model.describe()
