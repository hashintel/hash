"""Synchronous client for one long-lived Petrinaut CLI process."""

from __future__ import annotations

import json
import math
import os
import select
import signal
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from src.optimization_models import OptimizationModel, Scalar


PROCESS_SHUTDOWN_TIMEOUT_SECONDS = 5
MAX_MODEL_BOOTSTRAP_BYTES = 8 * 1024 * 1024
MAX_PROTOCOL_LINE_BYTES = 8 * 1024 * 1024
MODEL_BOOTSTRAP_TIMEOUT_SECONDS = 25
TRIAL_TIMEOUT_SECONDS = 240
_STDERR_DRAIN_CHUNK_BYTES = 64 * 1024


def _child_environment() -> dict[str, str]:
    """Return the complete, deliberately small environment for the CLI.

    The model is user-controlled and scenario expressions execute as
    JavaScript. Inheriting the service environment would therefore expose
    credentials even when the container itself is otherwise isolated.
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
    return environment


class PetrinautClientError(RuntimeError):
    """The Petrinaut process or its transport is no longer usable."""


class PetrinautProtocolError(PetrinautClientError):
    """The Petrinaut process returned an invalid protocol response."""


class PetrinautRunError(RuntimeError):
    """One scenario run failed while the CLI process remained usable."""


class PetrinautClient:
    """Own a CLI process compiled for one immutable model snapshot.

    The executable command is deliberately an internal constructor argument. It
    is injectable for tests and deployment, but is never part of the HTTP API.
    """

    def __init__(
        self,
        model: OptimizationModel,
        *,
        command: Sequence[str] = ("petrinaut",),
        popen_factory: Callable[..., Any] = subprocess.Popen,
        bootstrap_timeout_seconds: float = MODEL_BOOTSTRAP_TIMEOUT_SECONDS,
        request_timeout_seconds: float = TRIAL_TIMEOUT_SECONDS,
    ) -> None:
        if not command or any(not part for part in command):
            raise ValueError("the Petrinaut command must not be empty")
        if bootstrap_timeout_seconds <= 0 or request_timeout_seconds <= 0:
            raise ValueError("Petrinaut timeouts must be positive")
        self._model = model
        self._command = tuple(command)
        self._popen_factory = popen_factory
        self._bootstrap_timeout_seconds = bootstrap_timeout_seconds
        self._request_timeout_seconds = request_timeout_seconds
        self._process: subprocess.Popen[bytes] | None = None
        self._next_id = 1
        self._state_lock = threading.Lock()
        self._stdout_buffer = bytearray()
        self._stderr_buffer = bytearray()
        self._stderr_thread: threading.Thread | None = None

    def __enter__(self) -> PetrinautClient:
        self.start()
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def start(self) -> None:
        """Start the CLI, send its model bootstrap, and wait until it is ready."""
        with self._state_lock:
            if self._process is not None:
                return
            try:
                process = self._popen_factory(
                    [*self._command, "serve", "--model-stdin", "--stdio"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0,
                    close_fds=True,
                    env=_child_environment(),
                    start_new_session=True,
                    umask=0o077,
                )
            except (OSError, ValueError) as error:
                raise PetrinautClientError(
                    f"failed to start the Petrinaut CLI: {error}"
                ) from error
            self._process = process

        if process.stdin is None or process.stdout is None or process.stderr is None:
            self.close()
            raise PetrinautClientError("the Petrinaut CLI pipes are unavailable")

        model_json = json.dumps(
            self._model.as_legacy_file(),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        if len(model_json.encode("utf-8")) > MAX_MODEL_BOOTSTRAP_BYTES:
            self.close()
            raise PetrinautClientError("the Petrinaut model exceeds the 8 MiB limit")

        try:
            process.stdin.write((model_json + "\n").encode())
            process.stdin.flush()
            status = self._readline(
                process.stderr,
                self._stderr_buffer,
                timeout_seconds=self._bootstrap_timeout_seconds,
                description="Petrinaut model bootstrap",
            ).strip()
        except (BrokenPipeError, OSError, ValueError, PetrinautClientError) as error:
            self.close()
            raise PetrinautClientError(
                "failed to bootstrap the Petrinaut CLI"
            ) from error

        if not status.startswith("Petrinaut stdio ready"):
            exit_code = process.poll()
            self.close()
            detail = status or f"process exited with code {exit_code}"
            raise PetrinautClientError(f"Petrinaut failed to load the model: {detail}")

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
        """Read test doubles without a file descriptor."""
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
        """Read one bounded UTF-8 line without waiting forever."""
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
            raise PetrinautProtocolError(
                f"{description} exceeded the 8 MiB line limit"
            )
        try:
            return line.decode("utf-8")
        except UnicodeDecodeError as error:
            raise PetrinautProtocolError(
                f"{description} was not valid UTF-8"
            ) from error

    @staticmethod
    def _drain_stderr(stream: Any) -> None:
        """Prevent model-controlled stderr output from filling the pipe."""
        while True:
            try:
                chunk = stream.read(_STDERR_DRAIN_CHUNK_BYTES)
            except (OSError, ValueError):
                return
            if not chunk:
                return

    def _exchange(self, method: str, params: Mapping[str, Any] | None) -> Any:
        process = self._process
        if process is None or process.stdin is None or process.stdout is None:
            raise PetrinautClientError("the Petrinaut CLI is not running")
        if process.poll() is not None:
            raise PetrinautClientError(
                f"the Petrinaut CLI exited with code {process.returncode}"
            )

        request_id = self._next_id
        self._next_id += 1
        payload: dict[str, Any] = {"id": request_id, "method": method}
        if params is not None:
            payload["params"] = dict(params)

        try:
            process.stdin.write(
                (json.dumps(payload, separators=(",", ":")) + "\n").encode()
            )
            process.stdin.flush()
            line = self._readline(
                process.stdout,
                self._stdout_buffer,
                timeout_seconds=self._request_timeout_seconds,
                description="Petrinaut trial response",
            )
        except PetrinautProtocolError:
            # A malformed response is fatal to the stream, but preserve its
            # category so the optimizer does not treat it as a failed trial.
            raise
        except (
            BrokenPipeError,
            OSError,
            ValueError,
            PetrinautClientError,
        ) as error:
            self.close()
            raise PetrinautClientError(
                "failed to communicate with the Petrinaut CLI"
            ) from error

        if not line:
            raise PetrinautClientError(
                f"the Petrinaut CLI exited without a response (code {process.poll()})"
            )
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
            # A well-formed error response means the CLI handled the request
            # and can accept another trial. Transport and protocol failures use
            # the fatal exception classes above instead.
            raise PetrinautRunError(str(message))
        if "result" not in response:
            raise PetrinautProtocolError(
                "the Petrinaut CLI response omitted its result"
            )
        return response["result"]

    def run_scenario(
        self,
        *,
        scenario_id: str,
        parameter_values: Mapping[str, Scalar],
        metric_id: str,
        max_time: int | float,
        dt: int | float,
        seed: int,
    ) -> float:
        """Run a materialized scenario and return its numeric objective metric."""
        result = self._exchange(
            "run",
            {
                "scenario": {
                    "id": scenario_id,
                    "parameterValues": dict(parameter_values),
                },
                "metrics": [metric_id],
                "maxTime": max_time,
                "dt": dt,
                "seed": seed,
            },
        )
        if not isinstance(result, dict) or not isinstance(result.get("metrics"), dict):
            raise PetrinautProtocolError(
                "the Petrinaut CLI response omitted its metrics"
            )
        objective = result["metrics"].get(metric_id)
        if (
            isinstance(objective, bool)
            or not isinstance(objective, (int, float))
            or not math.isfinite(objective)
        ):
            # Metric code is model-controlled and may fail only for particular
            # suggested values. The response itself is valid, so keep the CLI
            # alive and let Optuna record this as a failed trial.
            raise PetrinautRunError(
                f'Petrinaut metric "{metric_id}" is not a finite number'
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

    def close(self) -> None:
        """Stop the owned process. Safe to call repeatedly or during a request."""
        with self._state_lock:
            process = self._process
            self._process = None
        if process is None:
            return

        if process.stdin is not None and not process.stdin.closed:
            try:
                process.stdin.close()
            except (BrokenPipeError, OSError, ValueError):
                pass

        if process.poll() is None:
            try:
                process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                self._signal_process(process, signal.SIGTERM)
                try:
                    process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
                except subprocess.TimeoutExpired:
                    self._signal_process(process, signal.SIGKILL)
                    process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)

        for stream in (process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                try:
                    stream.close()
                except (OSError, ValueError):
                    pass

        stderr_thread = self._stderr_thread
        self._stderr_thread = None
        if stderr_thread is not None and stderr_thread is not threading.current_thread():
            stderr_thread.join(timeout=1)
