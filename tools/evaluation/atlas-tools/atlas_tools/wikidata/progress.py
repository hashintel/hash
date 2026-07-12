"""Progress reporting for long-running miner operations.

The library is silent by default (:data:`NO_PROGRESS`); the CLI injects a
:class:`StderrProgress` so pipelines keep a clean stdout. The reporter is a
tiny protocol rather than logging so tests can assert progress semantics
(phases seen, counts advanced) without parsing formatted strings.
"""

import sys
import time
from collections.abc import Callable
from typing import Protocol


class ProgressReporter(Protocol):
    def phase(self, name: str, *, total: int | None = None) -> None:
        """Start a named phase with an optional known item total."""
        ...

    def advance(self, count: int = 1) -> None:
        """Record ``count`` completed items within the current phase."""
        ...

    def note(self, message: str) -> None:
        """Emit a one-off remark (fallbacks, skips, resumes)."""
        ...


class NoProgress:
    """Silent default: the library never prints unless asked to."""

    def phase(self, name: str, *, total: int | None = None) -> None: ...

    def advance(self, count: int = 1) -> None: ...

    def note(self, message: str) -> None: ...


NO_PROGRESS = NoProgress()


class StderrProgress:
    """Human-oriented progress lines on stderr.

    Output is throttled to one line per ``min_interval_seconds``: a
    warm-cache run advances thousands of items per second, and
    unthrottled output would drown the terminal.
    """

    def __init__(
        self,
        *,
        write: Callable[[str], None] | None = None,
        clock: Callable[[], float] = time.monotonic,
        min_interval_seconds: float = 1.0,
    ) -> None:
        self._write = write if write is not None else self._write_stderr
        self._clock = clock
        self._min_interval = min_interval_seconds
        self._started_at = clock()
        self._phase = ""
        self._total: int | None = None
        self._done = 0
        self._last_line_at: float | None = None

    @staticmethod
    def _write_stderr(line: str) -> None:
        sys.stderr.write(line + "\n")
        sys.stderr.flush()

    def _elapsed(self) -> str:
        seconds = int(self._clock() - self._started_at)
        return f"{seconds // 60:02d}:{seconds % 60:02d}"

    def phase(self, name: str, *, total: int | None = None) -> None:
        self._phase = name
        self._total = total
        self._done = 0
        self._last_line_at = None
        suffix = f" ({total} items)" if total is not None else ""
        self._write(f"[{self._elapsed()}] {name}{suffix}")

    def advance(self, count: int = 1) -> None:
        self._done += count
        now = self._clock()
        if (
            self._last_line_at is not None
            and now - self._last_line_at < self._min_interval
            and self._done != self._total
        ):
            return
        self._last_line_at = now
        of_total = f"/{self._total}" if self._total is not None else ""
        self._write(f"[{self._elapsed()}]   {self._phase}: {self._done}{of_total}")

    def note(self, message: str) -> None:
        self._write(f"[{self._elapsed()}]   {message}")
