from __future__ import annotations

import io
import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from contextlib import suppress
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
    # The spawn environment stays an allowlist: the correlation id must be
    # the explicit per-run value, never read from the ambient environment.
    monkeypatch.setenv(
        "PETRINAUT_OPTIMIZATION_RUN_ID", "ambient-must-not-leak"
    )
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
        optimization_run_id="run-123",
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
    assert invocation["kwargs"]["env"]["PETRINAUT_OPTIMIZATION_RUN_ID"] == (
        "run-123"
    )
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


def test_spawn_environment_omits_an_unset_optimization_run_id(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "PETRINAUT_OPTIMIZATION_RUN_ID", "ambient-must-not-leak"
    )
    invocation: dict[str, Any] = {}
    process = FakeProcess([])

    def popen_factory(command: list[str], **kwargs: Any) -> FakeProcess:
        invocation["kwargs"] = kwargs
        return process

    model = PetrinautModel(optimization_manifest, popen_factory=popen_factory)
    model.start()
    model.close()

    assert "PETRINAUT_OPTIMIZATION_RUN_ID" not in invocation["kwargs"]["env"]


def test_forwards_cli_stderr_lines_into_logs_with_the_optimization_run_id(
    optimization_manifest: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    diagnostics = b'{"event":"request","outcome":"ok"}\nplain diagnostic\n'
    process = FakeProcess([])
    process.stderr = io.BytesIO(
        b"Petrinaut stdio ready for optimization\n" + diagnostics
    )
    model = PetrinautModel(
        optimization_manifest,
        optimization_run_id="run-777",
        popen_factory=lambda *_args, **_kwargs: process,
    )

    with caplog.at_level(logging.INFO, logger="pn_cli"):
        model.start()
        stderr_thread = model._stderr_thread
        assert stderr_thread is not None
        stderr_thread.join(timeout=1)
        model.close()

    forwarded = [
        record for record in caplog.records if record.name == "pn_cli"
    ]
    assert [record.getMessage() for record in forwarded] == [
        '{"event":"request","outcome":"ok"}',
        "plain diagnostic",
    ]
    assert all(record.run_id == "run-777" for record in forwarded)
    assert all(record.event == "cli_stderr" for record in forwarded)
    assert all(record.stderr_truncated is False for record in forwarded)


def test_truncates_oversized_cli_stderr_lines(
    optimization_manifest: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    oversized = b"x" * (petrinaut_client.STDERR_LINE_LOG_CHARACTERS + 500)
    process = FakeProcess([])
    process.stderr = io.BytesIO(
        b"Petrinaut stdio ready for optimization\n" + oversized + b"\nshort\n"
    )
    model = PetrinautModel(
        optimization_manifest,
        optimization_run_id="run-778",
        popen_factory=lambda *_args, **_kwargs: process,
    )

    with caplog.at_level(logging.INFO, logger="pn_cli"):
        model.start()
        stderr_thread = model._stderr_thread
        assert stderr_thread is not None
        stderr_thread.join(timeout=1)
        model.close()

    forwarded = [
        record for record in caplog.records if record.name == "pn_cli"
    ]
    assert [len(record.getMessage()) for record in forwarded] == [
        petrinaut_client.STDERR_LINE_LOG_CHARACTERS,
        len("short"),
    ]
    assert forwarded[0].stderr_truncated is True
    assert forwarded[1].stderr_truncated is False


def test_stderr_forwarding_bounds_memory_for_newline_free_floods(
    optimization_manifest: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    flood = b"y" * (petrinaut_client._MAX_PENDING_STDERR_LINE_BYTES * 3)
    process = FakeProcess([])
    process.stderr = io.BytesIO(
        b"Petrinaut stdio ready for optimization\n" + flood + b"\nafter\n"
    )
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )

    with caplog.at_level(logging.INFO, logger="pn_cli"):
        model.start()
        stderr_thread = model._stderr_thread
        assert stderr_thread is not None
        stderr_thread.join(timeout=1)
        model.close()

    forwarded = [
        record for record in caplog.records if record.name == "pn_cli"
    ]
    # The flood is logged once, truncated; its tail is discarded, and the
    # next complete line is forwarded normally.
    assert [record.getMessage()[:5] for record in forwarded] == ["yyyyy", "after"]
    assert forwarded[0].stderr_truncated is True
    assert len(forwarded[0].getMessage()) == (
        petrinaut_client.STDERR_LINE_LOG_CHARACTERS
    )


def test_caps_the_number_of_forwarded_cli_stderr_lines(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(petrinaut_client, "_MAX_FORWARDED_STDERR_LINES", 3)
    lines = b"".join(f"line {index}\n".encode() for index in range(10))
    process = FakeProcess([])
    process.stderr = io.BytesIO(b"Petrinaut stdio ready for optimization\n" + lines)
    model = PetrinautModel(
        optimization_manifest,
        popen_factory=lambda *_args, **_kwargs: process,
    )

    with caplog.at_level(logging.INFO, logger="pn_cli"):
        model.start()
        stderr_thread = model._stderr_thread
        assert stderr_thread is not None
        stderr_thread.join(timeout=1)
        model.close()

    forwarded = [record for record in caplog.records if record.name == "pn_cli"]
    events = [record.event for record in forwarded]
    # Three lines forwarded, then exactly one suppression notice; the rest are
    # drained but not logged.
    assert events == ["cli_stderr", "cli_stderr", "cli_stderr", "cli_stderr_suppressed"]
    assert forwarded[-1].levelno == logging.WARNING


def test_seeds_stderr_drain_with_bytes_read_past_the_handshake(
    optimization_manifest: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A real pipe delivers the ready line and a diagnostic in one chunk."""
    read_fd, write_fd = os.pipe()
    reader = os.fdopen(read_fd, "rb", buffering=0)
    os.write(
        write_fd,
        b"Petrinaut stdio ready for optimization\n"
        b'{"event":"bootstrap_completed"}\n',
    )

    process = FakeProcess([])
    process.stderr = reader
    model = PetrinautModel(
        optimization_manifest,
        optimization_run_id="run-seed",
        popen_factory=lambda *_args, **_kwargs: process,
    )

    try:
        with caplog.at_level(logging.INFO, logger="pn_cli"):
            model.start()
            os.close(write_fd)
            stderr_thread = model._stderr_thread
            assert stderr_thread is not None
            stderr_thread.join(timeout=1)
            model.close()
    finally:
        with suppress(OSError):
            os.close(write_fd)

    forwarded = [record for record in caplog.records if record.name == "pn_cli"]
    assert [record.getMessage() for record in forwarded] == [
        '{"event":"bootstrap_completed"}'
    ]
    assert forwarded[0].run_id == "run-seed"


def test_graceful_close_logs_the_eof_termination_path(
    optimization_manifest: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    process = FakeProcess([])
    model = PetrinautModel(
        optimization_manifest,
        optimization_run_id="run-779",
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with caplog.at_level(logging.INFO, logger="pn_client"):
        model.close()

    termination = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "cli_terminated"
    )
    assert termination.termination == "graceful-eof"
    assert termination.run_id == "run-779"
    assert termination.graceful is True


def test_prompt_close_logs_the_signalled_termination_path(
    optimization_manifest: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    process = FakeProcess([])
    model = PetrinautModel(
        optimization_manifest,
        optimization_run_id="run-780",
        popen_factory=lambda *_args, **_kwargs: process,
    )
    model.start()

    with caplog.at_level(logging.INFO, logger="pn_client"):
        model.close(graceful=False)

    termination = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "cli_terminated"
    )
    assert termination.termination == "sigterm"
    assert termination.run_id == "run-780"
    assert termination.graceful is False


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


def test_prompt_close_terminates_a_busy_process_quickly(
    optimization_manifest: dict,
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
