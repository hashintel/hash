"""Small stdio client for the Petrinaut optimization CLI protocol."""

import json
import math
import os
import selectors
import signal
import subprocess  # noqa: S404 — this module exists to own the Petrinaut CLI subprocess.
import threading
import time
from collections.abc import Mapping, Sequence
from contextlib import suppress
from typing import IO, Protocol, Self

from pydantic import JsonValue

MAX_MANIFEST_BYTES = 8 * 1024 * 1024
MAX_PROTOCOL_LINE_BYTES = 8 * 1024 * 1024
BOOTSTRAP_TIMEOUT_SECONDS = 25
PROTOCOL_READ_TIMEOUT_SECONDS = 240
PROCESS_SHUTDOWN_TIMEOUT_SECONDS = 5
_STDERR_DRAIN_CHUNK_BYTES = 64 * 1024

type Scalar = bool | int | float
"""One flat JSON scalar exchanged as an optimization parameter value."""


class PetrinautProcess(Protocol):
    """The slice of ``subprocess.Popen`` behaviour this client depends on."""

    @property
    def stdin(self) -> IO[bytes] | None: ...

    @property
    def stdout(self) -> IO[bytes] | None: ...

    @property
    def stderr(self) -> IO[bytes] | None: ...

    @property
    def pid(self) -> int | None:
        """Process id used to signal the process group; ``None`` for fakes."""
        ...

    @property
    def returncode(self) -> int | None: ...

    def poll(self) -> int | None: ...

    def wait(self, timeout: float | None = None, /) -> int: ...

    def terminate(self) -> None: ...

    def kill(self) -> None: ...


class PetrinautProcessFactory(Protocol):
    """Spawn one Petrinaut CLI process; a seam for tests to inject fakes."""

    def __call__(
        self,
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
    ) -> PetrinautProcess: ...


def _spawn_cli_process(
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
) -> subprocess.Popen[bytes]:
    """Spawn the CLI process; the argv is owned configuration, never user input."""
    return subprocess.Popen(  # noqa: S603 — argv is built from owned configuration, never request data.
        command,
        stdin=stdin,
        stdout=stdout,
        stderr=stderr,
        bufsize=bufsize,
        close_fds=close_fds,
        env=env,
        start_new_session=start_new_session,
        umask=umask,
    )


def _child_environment() -> dict[str, str]:
    """Avoid exposing the API process's credentials to model expressions."""
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
    """One optimization evaluation failed while the CLI remains usable."""


class PetrinautModel:
    """Own one CLI process initialized with an opaque optimization manifest."""

    def __init__(
        self,
        optimization_manifest: Mapping[str, JsonValue],
        *,
        command: Sequence[str] = ("petrinaut",),
        popen_factory: PetrinautProcessFactory = _spawn_cli_process,
        bootstrap_timeout_seconds: float = BOOTSTRAP_TIMEOUT_SECONDS,
        request_timeout_seconds: float = PROTOCOL_READ_TIMEOUT_SECONDS,
    ) -> None:
        if not command or any(not part for part in command):
            raise ValueError("the Petrinaut command must not be empty")
        if bootstrap_timeout_seconds <= 0 or request_timeout_seconds <= 0:
            raise ValueError("Petrinaut timeouts must be positive")

        self.optimization_manifest = dict(optimization_manifest)
        self.command = tuple(command)
        self._popen_factory = popen_factory
        self._bootstrap_timeout_seconds = bootstrap_timeout_seconds
        self._request_timeout_seconds = request_timeout_seconds
        self._process: PetrinautProcess | None = None
        self._next_id = 1
        self._state_lock = threading.Lock()
        self._stdout_buffer = bytearray()
        self._stderr_buffer = bytearray()
        self._stderr_thread: threading.Thread | None = None

    def __enter__(self) -> Self:
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
            raise PetrinautClientError("the optimization manifest exceeds the 8 MiB limit")

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
                    env=_child_environment(),
                    start_new_session=True,
                    umask=0o077,
                )
            except (OSError, ValueError) as error:
                raise PetrinautClientError(f"failed to start the Petrinaut CLI: {error}") from error

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
            raise PetrinautClientError("failed to bootstrap the Petrinaut CLI") from error

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
    def _fallback_readline(stream: IO[bytes], maximum_bytes: int) -> bytes:
        """Read test doubles which do not expose a file descriptor."""
        return stream.readline(maximum_bytes + 2)

    @staticmethod
    def _decode_protocol_line(line: bytes, description: str) -> str:
        if len(line) > MAX_PROTOCOL_LINE_BYTES:
            raise PetrinautProtocolError(f"{description} exceeded the 8 MiB line limit")
        try:
            return line.decode("utf-8")
        except UnicodeDecodeError as error:
            raise PetrinautProtocolError(f"{description} was not valid UTF-8") from error

    def _readline(
        self,
        stream: IO[bytes],
        buffer: bytearray,
        *,
        timeout_seconds: float,
        description: str,
    ) -> str:
        """Read one size- and time-bounded UTF-8 protocol line."""
        with selectors.DefaultSelector() as selector:
            try:
                key = selector.register(stream, selectors.EVENT_READ)
            except OSError, ValueError:
                # Test doubles (io.BytesIO and friends) expose no descriptor
                # to poll, so read them directly and rely on the size bound.
                line = self._fallback_readline(stream, MAX_PROTOCOL_LINE_BYTES)
            else:
                line = self._read_polled_line(
                    selector,
                    key.fd,
                    buffer,
                    timeout_seconds=timeout_seconds,
                    description=description,
                )

        return self._decode_protocol_line(line, description)

    @staticmethod
    def _read_polled_line(
        selector: selectors.BaseSelector,
        descriptor: int,
        buffer: bytearray,
        *,
        timeout_seconds: float,
        description: str,
    ) -> bytes:
        """Accumulate one newline-terminated line from the registered pipe."""
        deadline = time.monotonic() + timeout_seconds

        while True:
            newline = buffer.find(b"\n")
            if newline >= 0:
                line = bytes(buffer[: newline + 1])

                del buffer[: newline + 1]
                return line

            if len(buffer) > MAX_PROTOCOL_LINE_BYTES:
                raise PetrinautProtocolError(f"{description} exceeded the 8 MiB line limit")

            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise PetrinautClientError(f"{description} timed out")

            # One raw read of whatever is available: readiness only promises
            # *some* bytes, and a buffered stream.read would block for a full
            # chunk. The CLI pipes are opened unbuffered (bufsize=0), so no
            # data can be stranded in a Python-level buffer above this read.
            chunk = os.read(descriptor, _STDERR_DRAIN_CHUNK_BYTES)
            if not chunk:
                line = bytes(buffer)

                buffer.clear()
                return line

            buffer.extend(chunk)

    @staticmethod
    def _drain_stderr(stream: IO[bytes]) -> None:
        """Prevent CLI diagnostics from filling and blocking its stderr pipe."""
        while True:
            try:
                chunk = stream.read(_STDERR_DRAIN_CHUNK_BYTES)
            except OSError, ValueError:
                return

            if not chunk:
                return

    def _exchange(self, method: str, params: Mapping[str, JsonValue] | None = None) -> JsonValue:
        process = self._process
        if process is None or process.stdin is None or process.stdout is None:
            raise PetrinautClientError("the Petrinaut CLI is not running")

        if process.poll() is not None:
            raise PetrinautClientError(f"the Petrinaut CLI exited with code {process.returncode}")

        request_id = self._next_id
        self._next_id += 1
        request: dict[str, JsonValue] = {"id": request_id, "method": method}
        if params is not None:
            request["params"] = dict(params)

        try:
            process.stdin.write((json.dumps(request, separators=(",", ":")) + "\n").encode())
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
            raise PetrinautClientError("failed to communicate with the Petrinaut CLI") from error

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
    def _parse_response(line: str, request_id: int) -> JsonValue:
        """Validate one response without conflating handled run errors."""
        try:
            response: JsonValue = json.loads(line)
        except json.JSONDecodeError as error:
            raise PetrinautProtocolError("the Petrinaut CLI returned invalid JSON") from error

        if not isinstance(response, dict):
            raise PetrinautProtocolError("the Petrinaut CLI returned a non-object response")

        if response.get("id") != request_id:
            raise PetrinautProtocolError("the Petrinaut CLI returned a mismatched response id")

        if "error" in response:
            error = response["error"]
            message = error.get("message", error) if isinstance(error, dict) else error

            raise PetrinautRunError(str(message))

        if "result" not in response:
            raise PetrinautProtocolError("the Petrinaut CLI response omitted its result")

        return response["result"]

    def describe_optimization(self) -> dict[str, JsonValue]:
        """Return the CLI-owned Optuna study and parameter description."""
        result = self._exchange("optimization.describe")
        if not isinstance(result, dict):
            self.close(graceful=False)
            raise PetrinautProtocolError("optimization.describe returned a non-object result")

        return result

    def objective(self, parameter_values: Mapping[str, Scalar]) -> float:
        """Evaluate one flat set of Optuna-proposed scenario parameter values."""
        values: dict[str, JsonValue] = dict(parameter_values)
        result = self._exchange("optimization.evaluate", {"parameterValues": values})
        if not isinstance(result, dict):
            self.close(graceful=False)
            raise PetrinautProtocolError("optimization.evaluate returned a non-object result")

        objective = result.get("objective")
        if (
            isinstance(objective, bool)
            or not isinstance(objective, (int, float))
            or not math.isfinite(objective)
        ):
            raise PetrinautRunError("Petrinaut optimization objective is not a finite number")

        return float(objective)

    @staticmethod
    def _signal_process(process: PetrinautProcess, signal_number: signal.Signals) -> None:
        """Signal the isolated process group, falling back for test doubles."""
        process_id = process.pid
        if process_id is not None:
            try:
                os.killpg(process_id, signal_number)
            except ProcessLookupError:
                return
            except OSError:
                pass
            else:
                return

        if signal_number is signal.SIGTERM:
            process.terminate()
        else:
            process.kill()

    @classmethod
    def _terminate_process(cls, process: PetrinautProcess) -> None:
        """Escalate from SIGTERM to SIGKILL until the process group exits."""
        cls._signal_process(process, signal.SIGTERM)
        try:
            process.wait(PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            cls._signal_process(process, signal.SIGKILL)
            with suppress(subprocess.TimeoutExpired):
                process.wait(PROCESS_SHUTDOWN_TIMEOUT_SECONDS)

    @classmethod
    def _shutdown_process(cls, process: PetrinautProcess, *, graceful: bool) -> None:
        if process.stdin is not None and not process.stdin.closed:
            with suppress(OSError, ValueError):
                process.stdin.close()

        if process.poll() is None and graceful:
            with suppress(subprocess.TimeoutExpired):
                process.wait(PROCESS_SHUTDOWN_TIMEOUT_SECONDS)

        if process.poll() is None:
            cls._terminate_process(process)

        for stream in (process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                with suppress(OSError, ValueError):
                    stream.close()

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

        self._shutdown_process(process, graceful=graceful)

        stderr_thread = self._stderr_thread
        self._stderr_thread = None
        if stderr_thread is not None and stderr_thread is not threading.current_thread():
            stderr_thread.join(timeout=1)
