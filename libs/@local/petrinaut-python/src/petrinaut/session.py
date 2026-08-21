"""The model-protocol session: what a caller can ask a model process.

A session owns one long-lived ``petrinaut serve`` child process for one model
and puts the model-protocol vocabulary on it: ``healthz``, ``metadata``,
``run``, and the generic ``request``. Everything about *how* the child is
spawned, read, timed out, and shut down lives in :mod:`petrinaut._transport`;
this module is the part a consumer reads.

POSIX only, via the transport: process groups and descriptor polling.
"""

from __future__ import annotations

import os
import subprocess
from collections.abc import Callable, Mapping, Sequence
from typing import Any, TypeVar, cast

from ._transport import (
    BOOTSTRAP_TIMEOUT_SECONDS,
    PROTOCOL_READ_TIMEOUT_SECONDS,
    CliTransport,
    encode_bootstrap_line,
)
from .errors import PetrinautProtocolError

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

    A model process answers only the model protocol: `optimization.*` methods
    need a manifest-serving process, which is
    :class:`~petrinaut.optimization.OptimizationSession`'s job — and that
    class answers everything this one does, since a manifest embeds a model.

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
        self._transport = CliTransport(
            serve_arguments=serve_arguments,
            bootstrap_line=bootstrap_line,
            source_label=source_label,
            command=command,
            popen_factory=popen_factory,
            bootstrap_timeout_seconds=bootstrap_timeout_seconds,
            request_timeout_seconds=request_timeout_seconds,
        )

    @property
    def command(self) -> tuple[str, ...]:
        """The executable and arguments the session spawns."""
        return self._transport.command

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
        self._transport.start()

    def close(self, *, graceful: bool = True) -> None:
        """Terminate the owned CLI process; safe to call repeatedly.

        The graceful default first waits for an EOF-driven exit, which only an
        idle CLI observes; ``graceful=False`` signals the child's process
        group immediately and is what cancellation and failure paths use.
        """
        self._transport.close(graceful=graceful)

    def request(self, method: str, params: Mapping[str, Any] | None = None) -> Any:
        """Send one protocol request and return its ``result``.

        Raises :class:`PetrinautRunError` when the CLI answers with an error
        frame (the session stays usable), and :class:`PetrinautClientError` /
        :class:`PetrinautProtocolError` when the transport or protocol breaks
        (the session is closed). ``params`` that will not serialize to JSON
        raise :class:`TypeError` before anything is written, leaving the
        session usable.
        """
        return self._transport.exchange(method, params)

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
        result = self._transport.exchange(method, params)
        if not isinstance(result, dict):
            self.close(graceful=False)
            raise PetrinautProtocolError(f"{method} returned a non-object result")
        # `json.loads` produced this, so the keys are strings.
        return cast("dict[str, Any]", result)
