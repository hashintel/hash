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


def _disable_cli_resource_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    """Isolate real-subprocess tests from the host's task budget.

    ``RLIMIT_NPROC`` is a per-real-UID bound on Linux, so applying the
    production default to a test child forks it against every task the
    invoking user already owns.
    """
    monkeypatch.setenv("HASH_PETRINAUT_OPT_CLI_CPU_SECONDS", "0")
    monkeypatch.setenv("HASH_PETRINAUT_OPT_CLI_MEMORY_BYTES", "0")
    monkeypatch.setenv("HASH_PETRINAUT_OPT_CLI_MAX_PROCESSES", "0")


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
    _disable_cli_resource_limits(monkeypatch)
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
    _disable_cli_resource_limits(monkeypatch)
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


def test_prompt_close_signals_the_group_before_any_shutdown_wait(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = FakeProcess([])
    process.pid = 12345
    events: list[str] = []

    def wait(*, timeout: float | None = None) -> int:
        events.append("wait")
        process.returncode = -signal.SIGTERM
        return process.returncode

    process.wait = wait  # type: ignore[method-assign]
    monkeypatch.setattr(
        petrinaut_client.os,
        "killpg",
        lambda _pid, sent_signal: events.append(
            f"killpg:{signal.Signals(sent_signal).name}"
        ),
    )
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    model.close(graceful=False)

    assert events == ["killpg:SIGTERM", "wait"]


def test_close_sweeps_grandchildren_from_the_process_group(
    optimization_manifest: dict,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even a graceful shutdown must not leave CLI descendants running."""
    _disable_cli_resource_limits(monkeypatch)
    heartbeat = tmp_path / "heartbeat"
    grandchild_code = (
        "import pathlib, time\n"
        f"path = pathlib.Path({str(heartbeat)!r})\n"
        "while True:\n"
        "    path.write_text(str(time.monotonic()))\n"
        "    time.sleep(0.02)\n"
    )
    script = (
        "import subprocess, sys\n"
        "sys.stdin.readline()\n"
        f"subprocess.Popen([sys.executable, '-c', {grandchild_code!r}])\n"
        'sys.stderr.write("Petrinaut stdio ready for optimization\\n")\n'
        "sys.stderr.flush()\n"
        "sys.stdin.readline()\n"
    )
    model = PetrinautModel(
        optimization_manifest,
        command=(sys.executable, "-c", script),
    )
    model.start()
    deadline = time.monotonic() + 2
    while not heartbeat.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert heartbeat.exists(), "the grandchild never started"

    # Graceful path: the direct child exits on stdin EOF, so without the
    # process-group sweep the grandchild would keep running.
    model.close()

    time.sleep(0.1)
    last_heartbeat = heartbeat.read_text()
    time.sleep(0.3)
    assert heartbeat.read_text() == last_heartbeat


def test_start_applies_resource_limits_to_real_processes(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limited_pids: list[int] = []
    monkeypatch.setattr(
        petrinaut_client,
        "_apply_child_resource_limits",
        limited_pids.append,
    )
    script = (
        "import sys\n"
        "sys.stdin.readline()\n"
        'sys.stderr.write("Petrinaut stdio ready for optimization\\n")\n'
        "sys.stderr.flush()\n"
        "sys.stdin.readline()\n"
    )
    model = PetrinautModel(
        optimization_manifest,
        command=(sys.executable, "-c", script),
    )
    model.start()
    process = model._process
    assert process is not None

    model.close(graceful=False)

    assert limited_pids == [process.pid]


def test_resource_limits_read_overrides_and_skip_disabled_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[int, int, tuple[int, int]]] = []

    class FakeResource:
        RLIMIT_CPU = 101
        RLIMIT_AS = 102
        RLIMIT_NPROC = 103

        @staticmethod
        def prlimit(pid: int, limit: int, bounds: tuple[int, int]) -> None:
            calls.append((pid, limit, bounds))

    monkeypatch.setattr(petrinaut_client, "resource", FakeResource)
    monkeypatch.setenv("HASH_PETRINAUT_OPT_CLI_CPU_SECONDS", "60")
    monkeypatch.setenv("HASH_PETRINAUT_OPT_CLI_MEMORY_BYTES", "0")
    monkeypatch.delenv("HASH_PETRINAUT_OPT_CLI_MAX_PROCESSES", raising=False)

    petrinaut_client._apply_child_resource_limits(4242)

    assert calls == [
        (4242, FakeResource.RLIMIT_CPU, (60, 60)),
        (
            4242,
            FakeResource.RLIMIT_NPROC,
            (
                petrinaut_client.DEFAULT_CLI_MAX_PROCESSES,
                petrinaut_client.DEFAULT_CLI_MAX_PROCESSES,
            ),
        ),
    ]


def test_resource_limits_ignore_non_integer_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HASH_PETRINAUT_OPT_CLI_CPU_SECONDS", "soon")

    assert (
        petrinaut_client._limit_from_environment(
            "HASH_PETRINAUT_OPT_CLI_CPU_SECONDS",
            petrinaut_client.DEFAULT_CLI_CPU_SECONDS,
        )
        == petrinaut_client.DEFAULT_CLI_CPU_SECONDS
    )


def test_prompt_close_terminates_a_busy_process_quickly(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A mid-trial CLI never notices stdin EOF, so cancellation must signal."""
    _disable_cli_resource_limits(monkeypatch)
    script = """
import sys
import time
sys.stdin.readline()
sys.stderr.write("Petrinaut stdio ready for optimization\\n")
sys.stderr.flush()
while True:
    time.sleep(0.1)
"""
    model = PetrinautModel(
        optimization_manifest,
        command=(sys.executable, "-c", script),
    )
    model.start()

    started_at = time.monotonic()
    model.close(graceful=False)

    assert time.monotonic() - started_at < 2


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
