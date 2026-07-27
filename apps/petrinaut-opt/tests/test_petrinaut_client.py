import io
import json
import signal
import subprocess  # noqa: S404 — the client under test owns a CLI subprocess.
import sys
import threading
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import override

import pytest
from pydantic import JsonValue

from src import petrinaut_client
from src.petrinaut_client import (
    PetrinautClientError,
    PetrinautModel,
    PetrinautProtocolError,
    PetrinautRunError,
)


class FakeProcess:
    def __init__(self, responses: list[dict[str, JsonValue]]) -> None:
        self.stdin = io.BytesIO()
        self.stdout = io.BytesIO(
            "".join(json.dumps(response) + "\n" for response in responses).encode()
        )
        self.stderr: io.BytesIO = io.BytesIO(b"Petrinaut stdio ready for optimization\n")
        self.pid: int | None = None
        self.returncode: int | None = None
        self.terminated = False
        self.killed = False

    def poll(self) -> int | None:
        return self.returncode

    def wait(self, _timeout: float | None = None, /) -> int:
        self.returncode = 0
        return 0

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = -15

    def kill(self) -> None:
        self.killed = True
        self.returncode = -9


@dataclass(slots=True)
class RecordedSpawn:
    """Every argument the client handed to its process factory."""

    command: Sequence[str]
    stdin: int
    stdout: int
    stderr: int
    bufsize: int
    close_fds: bool
    env: Mapping[str, str]
    start_new_session: bool
    umask: int


def test_bootstraps_an_opaque_manifest_and_uses_optimization_methods(
    optimization_manifest: dict[str, JsonValue],
    optimization_description: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "must-not-leak")
    monkeypatch.setenv("PETRINAUT_CLI_NODE_OPTIONS", "--max-old-space-size=768")
    process = FakeProcess([
        {"id": 1, "result": optimization_description},
        {"id": 2, "result": {"objective": 12.5}},
    ])
    spawns: list[RecordedSpawn] = []

    def popen_factory(
        command: Sequence[str],
        /,
        *,
        stdin: int,
        stdout: int,
        stderr: int,
        bufsize: int,
        close_fds: bool,
        env: Mapping[str, str],
        start_new_session: bool,
        umask: int,
    ) -> FakeProcess:
        spawns.append(
            RecordedSpawn(
                command=command,
                stdin=stdin,
                stdout=stdout,
                stderr=stderr,
                bufsize=bufsize,
                close_fds=close_fds,
                env=env,
                start_new_session=start_new_session,
                umask=umask,
            )
        )
        return process

    model = PetrinautModel(
        optimization_manifest,
        command=("node", "/cli.js"),
        popen_factory=popen_factory,
    )
    model.start()

    assert model.describe_optimization() == optimization_description
    assert model.objective({"rate": 1.25, "count": 6, "enabled": False}) == pytest.approx(12.5)
    lines = [json.loads(line) for line in process.stdin.getvalue().splitlines()]

    spawn = spawns[0]
    assert list(spawn.command) == [
        "node",
        "/cli.js",
        "serve",
        "--optimization-stdin",
        "--stdio",
    ]
    assert spawn.close_fds is True
    assert spawn.start_new_session is True
    assert spawn.env["NODE_OPTIONS"] == "--max-old-space-size=768"
    assert "AWS_SECRET_ACCESS_KEY" not in spawn.env
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
    optimization_manifest: dict[str, JsonValue],
) -> None:
    model = PetrinautModel(optimization_manifest)

    assert model._bootstrap_timeout_seconds == 25
    assert model._request_timeout_seconds == 240


def test_bootstrap_timeout_terminates_a_stuck_process(
    optimization_manifest: dict[str, JsonValue],
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
    optimization_manifest: dict[str, JsonValue],
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
    optimization_manifest: dict[str, JsonValue],
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
    optimization_manifest: dict[str, JsonValue],
) -> None:
    drained = threading.Event()

    class TrackingStream(io.BytesIO):
        @override
        def read(self, size: int | None = -1) -> bytes:
            drained.set()
            return super().read(size)

    process = FakeProcess([])
    process.stderr = TrackingStream(b"Petrinaut stdio ready for optimization\ndiagnostic\n")
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )

    model.start()

    assert drained.wait(timeout=1)
    model.close()


class UnkillableProcess(FakeProcess):
    """A process whose ``wait`` always times out, forcing signal escalation."""

    @override
    def wait(self, _timeout: float | None = None, /) -> int:
        raise subprocess.TimeoutExpired("petrinaut", _timeout or 0)


def test_close_signals_the_isolated_process_group(
    optimization_manifest: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = UnkillableProcess([])
    process.pid = 12345
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


class ShutdownRecordingProcess(FakeProcess):
    """Record the interleaving of ``killpg`` calls and shutdown waits."""

    def __init__(self, responses: list[dict[str, JsonValue]]) -> None:
        super().__init__(responses)
        self.events: list[str] = []

    @override
    def wait(self, _timeout: float | None = None, /) -> int:
        self.events.append("wait")
        self.returncode = -signal.SIGTERM
        return self.returncode


def test_prompt_close_signals_the_group_before_any_shutdown_wait(
    optimization_manifest: dict[str, JsonValue],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = ShutdownRecordingProcess([])
    process.pid = 12345
    monkeypatch.setattr(
        petrinaut_client.os,
        "killpg",
        lambda _pid, sent_signal: process.events.append(
            f"killpg:{signal.Signals(sent_signal).name}"
        ),
    )
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    model.close(graceful=False)

    assert process.events == ["killpg:SIGTERM", "wait"]


def test_prompt_close_terminates_a_busy_process_quickly(
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
    model = PetrinautModel(
        optimization_manifest,
        command=(sys.executable, "-c", script),
    )
    model.start()

    started_at = time.monotonic()
    model.close(graceful=False)

    assert time.monotonic() - started_at < 2


def test_cli_error_during_evaluation_is_recoverable(
    optimization_manifest: dict[str, JsonValue],
) -> None:
    process = FakeProcess([
        {"id": 1, "error": {"message": "scenario failed"}},
        {"id": 2, "result": {"objective": 7}},
    ])
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with pytest.raises(PetrinautRunError, match="scenario failed"):
        model.objective({"rate": 1})

    assert model.objective({"rate": 2}) == pytest.approx(7.0)
    model.close()


@pytest.mark.parametrize("objective", [True, None, float("inf")])
def test_rejects_a_non_finite_numeric_objective(
    optimization_manifest: dict[str, JsonValue],
    objective: JsonValue,
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
    optimization_manifest: dict[str, JsonValue],
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
