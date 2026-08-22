"""One Petrinaut CLI process, spoken to over JSON lines on stdio.

A session owns one long-lived ``petrinaut serve`` child process for one model
(or one optimization manifest, see :mod:`petrinaut.optimization`). The child
is spawned with a scrubbed environment and its own process group, requests are
written one JSON object per line, and every read is size- and time-bounded.

POSIX only: the session signals process groups with ``os.killpg`` and polls
descriptors with ``select.select``.
"""

from __future__ import annotations

import json
import os
import select
import signal
import subprocess
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from contextlib import suppress
from typing import Any, TypeVar, cast

from .errors import (
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)

_MIB = 1024 * 1024
MAX_BOOTSTRAP_LINE_BYTES = 8 * _MIB
MAX_PROTOCOL_LINE_BYTES = 8 * _MIB
BOOTSTRAP_TIMEOUT_SECONDS = 25
PROTOCOL_READ_TIMEOUT_SECONDS = 240
PROCESS_SHUTDOWN_TIMEOUT_SECONDS = 5
_READ_CHUNK_BYTES = 64 * 1024


def _child_environment() -> dict[str, str]:
    """Avoid exposing the calling process's credentials to model expressions."""
    environment = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "NO_COLOR": "1",
        "TZ": "UTC",
    }
    node_options = os.environ.get("PETRINAUT_CHILD_NODE_OPTIONS", "").strip()
    if node_options:
        environment["NODE_OPTIONS"] = node_options
    return environment


def encode_bootstrap_line(payload: Mapping[str, Any], label: str) -> str:
    """Serialize a stdin-provided model or manifest, enforcing the line cap.

    Raises ``TypeError`` for a payload that will not serialize to JSON and
    ``ValueError`` for one over the line cap: both are caller input, found
    before any process exists, so they are not ``PetrinautClientError``,
    which means a session's process or transport is gone.
    """
    try:
        line = json.dumps(dict(payload), ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError) as error:
        raise TypeError(f"the {label} is not JSON-serializable: {error}") from error
    if len(line.encode("utf-8")) > MAX_BOOTSTRAP_LINE_BYTES:
        raise ValueError(
            f"the {label} exceeds the {MAX_BOOTSTRAP_LINE_BYTES // _MIB} MiB limit"
        )
    return line


# The self type for ``__enter__``: a subclass used as a context manager keeps
# its own type. ``typing.Self`` needs Python 3.11, and this package runs on 3.10.
_SessionT = TypeVar("_SessionT", bound="PetrinautSession")


class PetrinautSession:
    """Own one CLI process serving one compiled Petrinaut model.

    Construct through a factory naming the model source::

        with PetrinautSession.from_model_file("./sir-model.json") as session:
            metadata = session.metadata()
            result = session.run({"maxSteps": 100, "seed": 42})

    Model-protocol methods (``healthz``, ``metadata``, ``run``, ``request``)
    return the CLI's JSON verbatim as dicts: no schema covers them yet. The
    optimization methods on :class:`~petrinaut.optimization.OptimizationSession`
    return schema-validated pydantic models instead.

    ``command`` defaults to the ``petrinaut`` executable on the child's fixed
    ``PATH``; pass an absolute command (for example
    ``(shutil.which("node"), cli_path)``) when the CLI lives elsewhere.
    ``popen_factory`` lets tests substitute the spawned process.
    """

    def __init__(
        self,
        *,
        serve_arguments: Sequence[str],
        bootstrap_line: str | None = None,
        source_label: str = "model",
        command: Sequence[str] = ("petrinaut",),
        popen_factory: Callable[..., Any] = subprocess.Popen,
        bootstrap_timeout_seconds: float = BOOTSTRAP_TIMEOUT_SECONDS,
        request_timeout_seconds: float = PROTOCOL_READ_TIMEOUT_SECONDS,
    ) -> None:
        if not command or any(not part for part in command):
            raise ValueError("the Petrinaut command must not be empty")
        if bootstrap_timeout_seconds <= 0 or request_timeout_seconds <= 0:
            raise ValueError("Petrinaut timeouts must be positive")

        self.command = tuple(command)
        self._serve_arguments = tuple(serve_arguments)
        self._bootstrap_line = bootstrap_line
        self._source_label = source_label
        self._popen_factory = popen_factory
        self._bootstrap_timeout_seconds = bootstrap_timeout_seconds
        self._base_request_timeout_seconds = request_timeout_seconds
        self._request_timeout_seconds = request_timeout_seconds
        self._process: subprocess.Popen[bytes] | None = None
        self._next_id = 1
        self._state_lock = threading.Lock()
        self._stdout_buffer = bytearray()
        self._stderr_buffer = bytearray()
        self._stderr_thread: threading.Thread | None = None

    # Static rather than classmethods: a subclass serving a manifest has its
    # own constructor, and routing through `cls` would reach it with no
    # source. A classmethod would also read as a subclass constructor on
    # `OptimizationSession.from_model_file(...)` while returning a base
    # session; a staticmethod makes no such promise.
    @staticmethod
    def from_model_file(
        path: str | os.PathLike[str], **options: Any
    ) -> PetrinautSession:
        """Serve a model JSON file (``petrinaut serve --model <path> --stdio``)."""
        return PetrinautSession(
            serve_arguments=("--model", os.fspath(path), "--stdio"),
            **options,
        )

    @staticmethod
    def from_model(model: Mapping[str, Any], **options: Any) -> PetrinautSession:
        """Serve a model object sent as the first stdin line (``--model-stdin``)."""
        return PetrinautSession(
            serve_arguments=("--model-stdin", "--stdio"),
            bootstrap_line=encode_bootstrap_line(model, "model"),
            **options,
        )

    def __enter__(self: _SessionT) -> _SessionT:
        self.start()
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def start(self) -> None:
        """Launch the CLI and wait for its readiness line on stderr."""
        with self._state_lock:
            if self._process is not None:
                return
            try:
                process = self._popen_factory(
                    [*self.command, "serve", *self._serve_arguments],
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
            self.close(graceful=False)
            raise PetrinautClientError("the Petrinaut CLI pipes are unavailable")

        try:
            if self._bootstrap_line is not None:
                process.stdin.write((self._bootstrap_line + "\n").encode())
                process.stdin.flush()
            status = self._readline(
                process.stderr,
                self._stderr_buffer,
                timeout_seconds=self._bootstrap_timeout_seconds,
                description="Petrinaut bootstrap",
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
                f"Petrinaut failed to load the {self._source_label}: {details}"
            )

        self._stderr_buffer.clear()
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr,
            args=(process.stderr,),
            daemon=True,
            name="petrinaut-stderr-drain",
        )
        self._stderr_thread.start()

    def request(self, method: str, params: Mapping[str, Any] | None = None) -> Any:
        """Send one protocol request and return its ``result``.

        Raises :class:`PetrinautRunError` when the CLI answers with an error
        frame (the session stays usable), and :class:`PetrinautClientError` /
        :class:`PetrinautProtocolError` when the transport or protocol breaks
        (the session is closed). ``params`` that will not serialize to JSON
        raise :class:`TypeError` before anything is written, leaving the
        session usable.
        """
        return self._exchange(method, params)

    def healthz(self) -> dict[str, Any]:
        """Liveness check; returns ``{"ok": True}``."""
        return self._request_object("healthz")

    def metadata(self) -> dict[str, Any]:
        """The compiled model's parameters, places, and metrics."""
        return self._request_object("metadata")

    def run(self, params: Mapping[str, Any]) -> dict[str, Any]:
        """Run one simulation; ``params`` is the CLI's run config."""
        return self._request_object("run", params)

    def _request_object(
        self, method: str, params: Mapping[str, Any] | None = None
    ) -> dict[str, Any]:
        result = self._exchange(method, params)
        if not isinstance(result, dict):
            self.close(graceful=False)
            raise PetrinautProtocolError(f"{method} returned a non-object result")
        # `json.loads` produced this, so the keys are strings.
        return cast("dict[str, Any]", result)

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

        def decode(line: bytes) -> str:
            if len(line) > MAX_PROTOCOL_LINE_BYTES:
                raise PetrinautProtocolError(
                    f"{description} exceeded the {MAX_PROTOCOL_LINE_BYTES // _MIB} MiB line limit"
                )
            try:
                return line.decode("utf-8")
            except UnicodeDecodeError as error:
                raise PetrinautProtocolError(
                    f"{description} was not valid UTF-8"
                ) from error

        try:
            descriptor = stream.fileno()
        except (AttributeError, OSError, ValueError):
            return decode(self._fallback_readline(stream, MAX_PROTOCOL_LINE_BYTES))

        deadline = time.monotonic() + timeout_seconds
        while True:
            newline = buffer.find(b"\n")
            if newline >= 0:
                line = bytes(buffer[: newline + 1])
                del buffer[: newline + 1]
                return decode(line)
            # Checked before the next read, so an unterminated line cannot grow
            # the buffer without bound.
            if len(buffer) > MAX_PROTOCOL_LINE_BYTES:
                raise PetrinautProtocolError(
                    f"{description} exceeded the {MAX_PROTOCOL_LINE_BYTES // _MIB} MiB line limit"
                )

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise PetrinautClientError(f"{description} timed out")
            ready, _, _ = select.select([descriptor], [], [], remaining)
            if not ready:
                raise PetrinautClientError(f"{description} timed out")
            chunk = os.read(descriptor, _READ_CHUNK_BYTES)
            if not chunk:
                # EOF with no newline: whatever arrived is the last line.
                line = bytes(buffer)
                buffer.clear()
                return decode(line)
            buffer.extend(chunk)

    @staticmethod
    def _drain_stderr(stream: Any) -> None:
        """Prevent CLI diagnostics from filling and blocking its stderr pipe."""
        while True:
            try:
                chunk = stream.read(_READ_CHUNK_BYTES)
            except (OSError, ValueError):
                return
            if not chunk:
                return

    def _exchange(self, method: str, params: Mapping[str, Any] | None = None) -> Any:
        process = self._process
        if process is None or process.stdin is None or process.stdout is None:
            raise PetrinautClientError("the Petrinaut CLI is not running")
        if process.poll() is not None:
            raise PetrinautClientError(
                f"the Petrinaut CLI exited with code {process.returncode}"
            )

        request_id = self._next_id
        request: dict[str, Any] = {"id": request_id, "method": method}
        if params is not None:
            request["params"] = dict(params)

        # Encoded before anything is sent: a params value that cannot be
        # serialized is the caller's bug, so it is a TypeError — not a
        # PetrinautClientError, which would claim a healthy session is gone.
        # The id is consumed only once encoding succeeds, so a request that
        # was never written leaves no gap in the id sequence.
        try:
            payload = (json.dumps(request, separators=(",", ":")) + "\n").encode()
        except (TypeError, ValueError) as error:
            raise TypeError(
                f"{method} params are not JSON-serializable: {error}"
            ) from error
        self._next_id += 1

        try:
            process.stdin.write(payload)
            process.stdin.flush()
            line = self._readline(
                process.stdout,
                self._stdout_buffer,
                timeout_seconds=self._request_timeout_seconds,
                description="Petrinaut protocol response",
            )
        except (PetrinautProtocolError, PetrinautClientError):
            # Already says which limit or deadline was hit; keep that message.
            self.close(graceful=False)
            raise
        except (BrokenPipeError, OSError, ValueError) as error:
            self.close(graceful=False)
            raise PetrinautClientError(
                f"failed to communicate with the Petrinaut CLI: {type(error).__name__}"
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
        frame = cast("dict[str, Any]", response)
        if frame.get("id") != request_id:
            raise PetrinautProtocolError(
                "the Petrinaut CLI returned a mismatched response id"
            )
        if "error" in frame:
            message: Any = frame["error"]
            if isinstance(message, dict):
                # `json.loads` produced this, so the keys are strings.
                message = cast("dict[str, Any]", message).get("message", message)
            raise PetrinautRunError(str(message))
        if "result" not in frame:
            raise PetrinautProtocolError(
                "the Petrinaut CLI response omitted its result"
            )
        return frame["result"]

    @staticmethod
    def _signal_process(process: Any, signal_number: signal.Signals) -> None:
        """Signal the isolated process group, falling back for test doubles."""
        process_id = getattr(process, "pid", None)
        if isinstance(process_id, int):
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

    def close(self, *, graceful: bool = True) -> None:
        """Terminate the owned CLI process; safe to call repeatedly.

        A busy CLI only observes stdin EOF between protocol requests, so the
        graceful EOF wait is reserved for shutdowns while the CLI is idle.
        Cancellation, timeouts, and failure paths must pass ``graceful=False``
        so the process group is signalled immediately instead of after the
        full shutdown timeout.
        """
        with self._state_lock:
            process = self._process
            self._process = None
        if process is None:
            return

        if process.stdin is not None and not process.stdin.closed:
            with suppress(BrokenPipeError, OSError, ValueError):
                process.stdin.close()
        if process.poll() is None and graceful:
            with suppress(subprocess.TimeoutExpired):
                process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
        if process.poll() is None:
            self._signal_process(process, signal.SIGTERM)
            try:
                process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                self._signal_process(process, signal.SIGKILL)
                with suppress(subprocess.TimeoutExpired):
                    process.wait(timeout=PROCESS_SHUTDOWN_TIMEOUT_SECONDS)
        for stream in (process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                with suppress(OSError, ValueError):
                    stream.close()

        stderr_thread = self._stderr_thread
        self._stderr_thread = None
        if (
            stderr_thread is not None
            and stderr_thread is not threading.current_thread()
        ):
            stderr_thread.join(timeout=1)
