#!/usr/bin/env python3
"""Small stdio client for the Petrinaut optimization CLI protocol."""

from __future__ import annotations

import json
import logging
import math
import os
import select
import signal
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any

log = logging.getLogger("pn_client")
cli_log = logging.getLogger("pn_cli")

MAX_MANIFEST_BYTES = 8 * 1024 * 1024
MAX_PROTOCOL_LINE_BYTES = 8 * 1024 * 1024
BOOTSTRAP_TIMEOUT_SECONDS = 25
PROTOCOL_READ_TIMEOUT_SECONDS = 240
PROCESS_SHUTDOWN_TIMEOUT_SECONDS = 5
_STDERR_DRAIN_CHUNK_BYTES = 64 * 1024
# Forwarded CLI stderr lines are bounded so a chatty or hostile CLI cannot
# bloat service logs; the pending partial-line buffer is bounded so it also
# cannot grow service memory.
STDERR_LINE_LOG_CHARACTERS = 2000
_MAX_PENDING_STDERR_LINE_BYTES = 16 * 1024


def _child_environment(correlation_id: str | None = None) -> dict[str, str]:
    """Avoid exposing the API process's credentials to model expressions.

    The environment stays an allowlist: the correlation id is the explicit
    value owned by this run, never read from the service's ambient
    environment.
    """
    environment = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "NO_COLOR": "1",
        "TZ": "UTC",
    }
    node_options = os.environ.get("PETRINAUT_CLI_NODE_OPTIONS", "").strip()
    if node_options:
        environment["NODE_OPTIONS"] = node_options
    if correlation_id:
        environment["PETRINAUT_CORRELATION_ID"] = correlation_id
    return environment


class PetrinautClientError(RuntimeError):
    """The Petrinaut process or its transport is no longer usable."""


class PetrinautProtocolError(PetrinautClientError):
    """The Petrinaut process returned an invalid protocol response."""


class PetrinautRunError(RuntimeError):
    """One optimization evaluation failed while the CLI remains usable."""


class PetrinautModel:
    """Own one CLI process initialized with an opaque optimization manifest."""

    def __init__(
        self,
        optimization_manifest: Mapping[str, Any],
        *,
        command: Sequence[str] = ("petrinaut",),
        correlation_id: str | None = None,
        popen_factory: Callable[..., Any] = subprocess.Popen,
        bootstrap_timeout_seconds: float = BOOTSTRAP_TIMEOUT_SECONDS,
        request_timeout_seconds: float = PROTOCOL_READ_TIMEOUT_SECONDS,
    ) -> None:
        if not command or any(not part for part in command):
            raise ValueError("the Petrinaut command must not be empty")
        if bootstrap_timeout_seconds <= 0 or request_timeout_seconds <= 0:
            raise ValueError("Petrinaut timeouts must be positive")

        self.optimization_manifest = dict(optimization_manifest)
        self.command = tuple(command)
        self.correlation_id = correlation_id
        self._popen_factory = popen_factory
        self._bootstrap_timeout_seconds = bootstrap_timeout_seconds
        self._request_timeout_seconds = request_timeout_seconds
        self._process: subprocess.Popen[bytes] | None = None
        self._next_id = 1
        self._state_lock = threading.Lock()
        self._stdout_buffer = bytearray()
        self._stderr_buffer = bytearray()
        self._stderr_thread: threading.Thread | None = None

    def __enter__(self) -> PetrinautModel:
        self.start()
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def start(self) -> None:
        """Launch the CLI and provide its optimization manifest over stdin."""
        try:
            manifest = json.dumps(
                self.optimization_manifest,
                ensure_ascii=False,
                separators=(",", ":"),
            )
        except (TypeError, ValueError) as error:
            raise PetrinautClientError(
                f"the optimization manifest is not valid JSON: {error}"
            ) from error
        if len(manifest.encode("utf-8")) > MAX_MANIFEST_BYTES:
            raise PetrinautClientError(
                "the optimization manifest exceeds the 8 MiB limit"
            )

        with self._state_lock:
            if self._process is not None:
                return
            try:
                process = self._popen_factory(
                    [
                        *self.command,
                        "serve",
                        "--optimization-stdin",
                        "--stdio",
                    ],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0,
                    close_fds=True,
                    env=_child_environment(self.correlation_id),
                    start_new_session=True,
                    umask=0o077,
                )
            except (OSError, ValueError) as error:
                raise PetrinautClientError(
                    f"failed to start the Petrinaut CLI: {error}"
                ) from error
            self._process = process

        if process.stdin is None or process.stdout is None or process.stderr is None:
            self.close(graceful=False)
            raise PetrinautClientError("the Petrinaut CLI pipes are unavailable")

        try:
            process.stdin.write((manifest + "\n").encode())
            process.stdin.flush()
            status = self._readline(
                process.stderr,
                self._stderr_buffer,
                timeout_seconds=self._bootstrap_timeout_seconds,
                description="Petrinaut optimization bootstrap",
            ).strip()
        except (BrokenPipeError, OSError, ValueError, PetrinautClientError) as error:
            self.close(graceful=False)
            raise PetrinautClientError(
                "failed to bootstrap the Petrinaut CLI"
            ) from error

        if not status.startswith("Petrinaut stdio ready"):
            details = status.strip() or f"process exited with code {process.poll()}"
            self.close(graceful=False)
            raise PetrinautClientError(
                f"Petrinaut failed to load the optimization manifest: {details}"
            )

        self._stderr_buffer.clear()
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr,
            args=(process.stderr,),
            daemon=True,
            name="petrinaut-stderr-drain",
        )
        self._stderr_thread.start()

    @staticmethod
    def _fallback_readline(stream: Any, maximum_bytes: int) -> bytes:
        """Read test doubles which do not expose a file descriptor."""
        line = stream.readline(maximum_bytes + 2)
        if isinstance(line, str):
            return line.encode()
        return line

    def _readline(
        self,
        stream: Any,
        buffer: bytearray,
        *,
        timeout_seconds: float,
        description: str,
    ) -> str:
        """Read one size- and time-bounded UTF-8 protocol line."""
        try:
            descriptor = stream.fileno()
        except (AttributeError, OSError, ValueError):
            line = self._fallback_readline(stream, MAX_PROTOCOL_LINE_BYTES)
            if len(line) > MAX_PROTOCOL_LINE_BYTES:
                raise PetrinautProtocolError(
                    f"{description} exceeded the 8 MiB line limit"
                )
            try:
                return line.decode("utf-8")
            except UnicodeDecodeError as error:
                raise PetrinautProtocolError(
                    f"{description} was not valid UTF-8"
                ) from error

        deadline = time.monotonic() + timeout_seconds
        while True:
            newline = buffer.find(b"\n")
            if newline >= 0:
                line = bytes(buffer[: newline + 1])
                del buffer[: newline + 1]
                break
            if len(buffer) > MAX_PROTOCOL_LINE_BYTES:
                raise PetrinautProtocolError(
                    f"{description} exceeded the 8 MiB line limit"
                )

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise PetrinautClientError(f"{description} timed out")
            ready, _, _ = select.select([descriptor], [], [], remaining)
            if not ready:
                raise PetrinautClientError(f"{description} timed out")
            chunk = os.read(descriptor, _STDERR_DRAIN_CHUNK_BYTES)
            if not chunk:
                line = bytes(buffer)
                buffer.clear()
                break
            buffer.extend(chunk)

        if len(line) > MAX_PROTOCOL_LINE_BYTES:
            raise PetrinautProtocolError(f"{description} exceeded the 8 MiB line limit")
        try:
            return line.decode("utf-8")
        except UnicodeDecodeError as error:
            raise PetrinautProtocolError(
                f"{description} was not valid UTF-8"
            ) from error

    def _drain_stderr(self, stream: Any) -> None:
        """Forward CLI stderr lines into service logs with bounded memory.

        Draining also prevents CLI diagnostics from filling and blocking its
        stderr pipe. Each complete line is forwarded to the ``pn_cli`` logger
        with this run's correlation id; a line that grows beyond the pending
        buffer is logged truncated and the rest of it is discarded, so a
        newline-free stderr flood can neither buffer unboundedly nor bloat
        the logs.
        """
        buffer = bytearray()
        discarding_oversized_line = False
        while True:
            try:
                chunk = stream.read(_STDERR_DRAIN_CHUNK_BYTES)
            except (OSError, ValueError):
                return
            if not chunk:
                if buffer and not discarding_oversized_line:
                    self._log_cli_stderr_line(bytes(buffer))
                return
            buffer.extend(chunk)
            while (newline := buffer.find(b"\n")) >= 0:
                line = bytes(buffer[:newline])
                del buffer[: newline + 1]
                if discarding_oversized_line:
                    # This newline ends the already-logged oversized line.
                    discarding_oversized_line = False
                    continue
                self._log_cli_stderr_line(line)
            if discarding_oversized_line:
                buffer.clear()
            elif len(buffer) > _MAX_PENDING_STDERR_LINE_BYTES:
                self._log_cli_stderr_line(bytes(buffer), truncated=True)
                buffer.clear()
                discarding_oversized_line = True

    def _log_cli_stderr_line(self, line: bytes, *, truncated: bool = False) -> None:
        """Log one CLI stderr line verbatim, bounded, with correlation."""
        text = line.decode("utf-8", errors="replace").rstrip("\r")
        if len(text) > STDERR_LINE_LOG_CHARACTERS:
            text = text[:STDERR_LINE_LOG_CHARACTERS]
            truncated = True
        if not text.strip():
            return
        cli_log.info(
            text,
            extra={
                "event": "cli_stderr",
                "run_id": self.correlation_id,
                "stderr_truncated": truncated,
            },
        )

    def _exchange(self, method: str, params: Mapping[str, Any] | None = None) -> Any:
        process = self._process
        if process is None or process.stdin is None or process.stdout is None:
            raise PetrinautClientError("the Petrinaut CLI is not running")
        if process.poll() is not None:
            raise PetrinautClientError(
                f"the Petrinaut CLI exited with code {process.returncode}"
            )

        request_id = self._next_id
        self._next_id += 1
        request: dict[str, Any] = {"id": request_id, "method": method}
        if params is not None:
            request["params"] = dict(params)

        try:
            process.stdin.write(
                (json.dumps(request, separators=(",", ":")) + "\n").encode()
            )
            process.stdin.flush()
            line = self._readline(
                process.stdout,
                self._stdout_buffer,
                timeout_seconds=self._request_timeout_seconds,
                description="Petrinaut protocol response",
            )
        except PetrinautProtocolError:
            self.close(graceful=False)
            raise
        except (
            BrokenPipeError,
            OSError,
            ValueError,
            PetrinautClientError,
        ) as error:
            self.close(graceful=False)
            raise PetrinautClientError(
                "failed to communicate with the Petrinaut CLI"
            ) from error

        if not line:
            self.close(graceful=False)
            raise PetrinautClientError(
                f"the Petrinaut CLI exited without a response (code {process.poll()})"
            )
        try:
            return self._parse_response(line, request_id)
        except PetrinautProtocolError:
            self.close(graceful=False)
            raise

    @staticmethod
    def _parse_response(line: str, request_id: int) -> Any:
        """Validate one response without conflating handled run errors."""
        try:
            response = json.loads(line)
        except json.JSONDecodeError as error:
            raise PetrinautProtocolError(
                "the Petrinaut CLI returned invalid JSON"
            ) from error
        if not isinstance(response, dict):
            raise PetrinautProtocolError(
                "the Petrinaut CLI returned a non-object response"
            )
        if response.get("id") != request_id:
            raise PetrinautProtocolError(
                "the Petrinaut CLI returned a mismatched response id"
            )
        if "error" in response:
            error = response["error"]
            message = error.get("message", error) if isinstance(error, dict) else error
            raise PetrinautRunError(str(message))
        if "result" not in response:
            raise PetrinautProtocolError(
                "the Petrinaut CLI response omitted its result"
            )
        return response["result"]

    def describe_optimization(self) -> dict[str, Any]:
        """Return the CLI-owned Optuna study and parameter description."""
        result = self._exchange("optimization.describe")
        if not isinstance(result, dict):
            self.close(graceful=False)
            raise PetrinautProtocolError(
                "optimization.describe returned a non-object result"
            )
        return result

    def objective(self, parameter_values: Mapping[str, Any]) -> float:
        """Evaluate one flat set of Optuna-proposed scenario parameter values."""
        result = self._exchange(
            "optimization.evaluate",
            {"parameterValues": dict(parameter_values)},
        )
        if not isinstance(result, dict):
            self.close(graceful=False)
            raise PetrinautProtocolError(
                "optimization.evaluate returned a non-object result"
            )
        objective = result.get("objective")
        if (
            isinstance(objective, bool)
            or not isinstance(objective, (int, float))
            or not math.isfinite(objective)
        ):
            raise PetrinautRunError(
                "Petrinaut optimization objective is not a finite number"
            )
        return float(objective)

    @staticmethod
    def _signal_process(process: Any, signal_number: signal.Signals) -> None:
        """Signal the isolated process group, falling back for test doubles."""
        process_id = getattr(process, "pid", None)
        if isinstance(process_id, int):
            try:
                os.killpg(process_id, signal_number)
                return
            except ProcessLookupError:
                return
            except OSError:
                pass
        if signal_number is signal.SIGTERM:
            process.terminate()
        else:
            process.kill()

    def close(self, *, graceful: bool = True) -> None:
        """Terminate the owned CLI process; safe to call repeatedly.

        A busy CLI only observes stdin EOF between protocol requests, so the
        graceful EOF wait is reserved for shutdowns after a study finished and
        the CLI is idle. Cancellation, timeouts, and failure paths must pass
        ``graceful=False`` so the process group is signalled immediately and
        optimizer capacity is released promptly instead of after the full
        shutdown timeout.
        """
        with self._state_lock:
            process = self._process
            self._process = None
        if process is None:
            return

        termination = "already-exited"
        if process.stdin is not None and not process.stdin.closed:
            try:
                process.stdin.close()
            except (BrokenPipeError, OSError, ValueError):
                pass
        if process.poll() is None and graceful:
            try:
                process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
                termination = "graceful-eof"
            except subprocess.TimeoutExpired:
                pass
        if process.poll() is None:
            self._signal_process(process, signal.SIGTERM)
            termination = "sigterm"
            try:
                process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                self._signal_process(process, signal.SIGKILL)
                termination = "sigkill"
                try:
                    process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
                except subprocess.TimeoutExpired:
                    termination = "sigkill-unconfirmed"
        for stream in (process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                try:
                    stream.close()
                except (OSError, ValueError):
                    pass

        stderr_thread = self._stderr_thread
        self._stderr_thread = None
        if (
            stderr_thread is not None
            and stderr_thread is not threading.current_thread()
        ):
            stderr_thread.join(timeout=1)

        log.info(
            "Petrinaut CLI terminated",
            extra={
                "event": "cli_terminated",
                "run_id": self.correlation_id,
                "termination": termination,
                "graceful": graceful,
                "returncode": process.poll(),
            },
        )
