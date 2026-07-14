"""Thread-safe execution stop control at the physical-request boundary."""

from collections.abc import Callable
from datetime import timedelta
from threading import Event, Lock


class ExecutionStoppedError(RuntimeError):
    """A peer failure stopped execution before another paid request began."""


class ExecutionControl:
    """Atomically order terminal stop signals against new paid-request starts."""

    def __init__(self) -> None:
        self._stop_event = Event()
        self._lock = Lock()

    def stop(self) -> None:
        """Prevent physical requests whose initiation has not already begun."""
        with self._lock:
            self._stop_event.set()

    def begin_physical_request(self, begin: Callable[[], None]) -> None:
        """Run marker/authorization setup unless a terminal failure won the race."""
        with self._lock:
            if self._stop_event.is_set():
                raise ExecutionStoppedError(
                    "execution stopped before the next physical request began"
                )
            begin()

    def wait_for_retry(self, delay: timedelta) -> None:
        """Wait for backoff, returning early when a peer terminal failure stops the run."""
        if self._stop_event.wait(delay.total_seconds()):
            raise ExecutionStoppedError("execution stopped during transient retry backoff")
