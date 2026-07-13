"""Progress reporting for long-running command-line operations.

Library entry points are silent by default through :data:`NO_PROGRESS`. CLIs inject a
:class:`StderrProgress` so machine-readable stdout remains clean while users see elapsed
time, throughput, and an ETA for phases with known totals.
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
        """Emit a one-off progress remark."""
        ...


class NoProgress:
    """Silent reporter used by library callers unless they opt into progress."""

    def phase(self, name: str, *, total: int | None = None) -> None: ...

    def advance(self, count: int = 1) -> None: ...

    def note(self, message: str) -> None: ...


NO_PROGRESS = NoProgress()


def _duration(seconds: float) -> str:
    rounded = max(0, int(seconds))
    hours, remainder = divmod(rounded, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


class StderrProgress:
    """Human-readable, throttled progress with throughput and ETA on stderr."""

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
        self._phase_started_at = self._started_at
        self._phase = ""
        self._total: int | None = None
        self._done = 0
        self._last_line_at: float | None = None

    @staticmethod
    def _write_stderr(line: str) -> None:
        sys.stderr.write(line + "\n")
        sys.stderr.flush()

    def _elapsed(self, now: float | None = None) -> str:
        current = self._clock() if now is None else now
        return _duration(current - self._started_at)

    def phase(self, name: str, *, total: int | None = None) -> None:
        now = self._clock()
        self._phase = name
        self._total = total
        self._done = 0
        self._phase_started_at = now
        self._last_line_at = None
        suffix = f" ({total:,} items)" if total is not None else ""
        self._write(f"[{self._elapsed(now)}] {name}{suffix}")

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

        # Quote throughput and ETA only once a full throttle interval of
        # evidence exists: an instantaneous rate measured over the first
        # milliseconds of a phase (or a frozen test clock) prints noise
        # like "1,000,000,000/s", not signal.
        phase_seconds = now - self._phase_started_at
        has_evidence = phase_seconds >= max(self._min_interval, 1e-9)
        rate = self._done / phase_seconds if has_evidence else None

        if self._total is None:
            status = f"{self._done:,}" if rate is None else f"{self._done:,} ({rate:,.0f}/s)"
        else:
            percentage = 100.0 * self._done / self._total if self._total else 100.0
            stats = f"{percentage:.1f}%"
            if rate is not None and rate > 0:
                eta = _duration(max(0, self._total - self._done) / rate)
                stats = f"{stats}, {rate:,.0f}/s, ETA {eta}"
            status = f"{self._done:,}/{self._total:,} ({stats})"
        self._write(f"[{self._elapsed(now)}]   {self._phase}: {status}")

    def note(self, message: str) -> None:
        self._write(f"[{self._elapsed()}]   {message}")
