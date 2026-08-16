#!/usr/bin/env python3
"""Detached, reconnectable optimization runs.

A detached run owns one admitted optimizer and session pair, and drives its study from
a background task, appending every SSE frame body to an in-memory event log
instead of an HTTP response. Consumers attach — and re-attach — over
``GET /optimize/runs/{run_id}/events`` with a cursor; disconnecting a consumer
does not affect the run. The admission slot's lifetime equals the run's
lifetime: the idempotent cleanup (prompt session close plus slot release) runs
when the run reaches a terminal state or is cancelled/reaped, never when a
consumer detaches.

The event log holds one frame per completed trial plus a handful of control
frames; it is bounded because the optimizer itself rejects study descriptions
above ``MAX_STUDY_TRIALS`` (1000) trials — mirroring the optimization
manifest contract — rather than trusting the reported trial count.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from contextlib import suppress
from enum import Enum
from typing import Any

from src.utils import Phase, set_status

log = logging.getLogger("pn_runs")

DETACH_GRACE_ENVIRONMENT_VARIABLE = "HASH_PETRINAUT_OPT_DETACH_GRACE_SECONDS"
DEFAULT_DETACH_GRACE_SECONDS = 300.0
SSE_HEARTBEAT_SECONDS = 30
_TAIL_POLL_SECONDS = 0.1
# The single terminal frame appended when a run is cancelled (client DELETE,
# orphan reaping, or service shutdown). Documented in the README and OpenAPI
# responses; NodeAPI distinguishes it from a study failure's ERROR data frame.
CANCELLED_FRAME = "event: cancelled\ndata: {}\n\n"


def detach_grace_seconds_from_environment() -> float:
    """Read the orphan grace period; invalid values fall back to the default.

    A value of zero or below disables the orphan reaper (terminal-run log
    retention then falls back to the default period). Invalid and non-finite
    values (``inf``, ``nan``, overflowing literals) fall back to the default.
    """
    raw = os.environ.get(DETACH_GRACE_ENVIRONMENT_VARIABLE, "").strip()
    if not raw:
        return DEFAULT_DETACH_GRACE_SECONDS
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_DETACH_GRACE_SECONDS
    if not math.isfinite(value):
        return DEFAULT_DETACH_GRACE_SECONDS
    return value


class RunState(str, Enum):
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class OptimizationRun:
    """One detached optimization run and its replayable event log.

    Every mutation happens on the event loop thread (the pump's ``on_event``
    callback, the endpoints, and the registry), so plain attributes suffice;
    the worker thread only reaches the loop via ``call_soon_threadsafe``
    inside the optimizer.
    """

    def __init__(
        self,
        *,
        run_id: str,
        optimizer: Any,
        cleanup: Callable[[], Awaitable[None]],
        correlation: Mapping[str, str | None] | None = None,
        account_id: str | None = None,
        requested_trials: int = 0,
    ) -> None:
        loop = asyncio.get_running_loop()
        self.run_id = run_id
        self.optimizer = optimizer
        self.cleanup = cleanup
        self.correlation: dict[str, str | None] = dict(correlation or {})
        # Opaque owner tag stamped by the authenticated proxy at creation.
        # When set, only requests carrying the same tag may attach to or
        # cancel the run, and the account is single-flight while it lives.
        self.account_id = account_id
        # Recorded so attachments can size their synthesized summary without
        # the proxy having to remember the manifest.
        self.requested_trials = requested_trials
        self.state = RunState.running
        # (seq, SSE frame body); seq starts at 1 and increments by one, so the
        # frame with sequence number ``seq`` lives at index ``seq - 1``.
        self.events: list[tuple[int, str]] = []
        self.attached = False
        self.attachment_epoch = 0
        self.created_at = loop.time()
        # Grace also counts from creation, before the first attachment.
        self.last_detached_at = loop.time()
        self.terminal_at: float | None = None
        self.cancel_requested = asyncio.Event()
        self.cancel_reason = "optimization run cancelled"
        self.finished = asyncio.Event()
        self.task: asyncio.Task[None] | None = None
        self._changed = asyncio.Event()

    def append_event(self, frame: str) -> int:
        """Append one SSE frame body and wake waiting tails."""
        seq = len(self.events) + 1
        self.events.append((seq, frame))
        self._wake()
        return seq

    def request_cancel(self, reason: str) -> bool:
        """Ask the pump to stop; False when already requested or terminal."""
        if self.cancel_requested.is_set() or self.state is not RunState.running:
            return False
        self.cancel_reason = reason
        self.cancel_requested.set()
        return True

    def begin_attachment(self) -> int:
        """Register a new consumer, superseding any previous attachment."""
        self.attachment_epoch += 1
        self.attached = True
        # Wake the superseded tail so it observes the epoch change promptly.
        self._wake()
        return self.attachment_epoch

    def end_attachment(self, epoch: int) -> None:
        """Mark the consumer gone; stale epochs are ignored. Idempotent."""
        if epoch != self.attachment_epoch or not self.attached:
            return
        self.attached = False
        self.last_detached_at = asyncio.get_running_loop().time()

    def mark_terminal(self, state: RunState) -> None:
        self.state = state
        self.terminal_at = asyncio.get_running_loop().time()
        self.finished.set()
        self._wake()

    def _wake(self) -> None:
        """Wake every waiting tail; each wait round gets a fresh event."""
        changed = self._changed
        self._changed = asyncio.Event()
        changed.set()

    async def wait_for_change(self, timeout: float) -> None:
        """Wait until the run appends, terminates, or is superseded."""
        waiter = self._changed
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(waiter.wait(), timeout)


async def attachment_event_stream(
    run: OptimizationRun,
    *,
    cursor: int,
    epoch: int,
    request: Any,
    correlation: Mapping[str, str | None] | None = None,
) -> AsyncIterator[str]:
    """Replay buffered frames with seq > cursor, then live-tail new ones.

    Every frame carries an ``id: <seq>`` line so a consumer can re-attach
    with ``?cursor=<seq>`` (or ``Last-Event-ID``). The stream ends when the
    run's log is terminal and fully replayed, when a newer attachment
    supersedes this one, or when the consumer disconnects — none of which
    affect the run itself. Comment heartbeats are sent while tailing.
    """
    log_context = {**(correlation or {}), "run_id": run.run_id}
    loop = asyncio.get_running_loop()
    # A cursor pointing past the end of the log would otherwise also filter
    # out every frame appended after attaching — including the terminal one.
    # Clamping is safe: sequence numbers are dense, append-only, and never
    # truncated, so nothing past the current length can have been delivered.
    cursor = min(cursor, len(run.events))
    next_index = 0
    next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
    log.info(
        "consumer attached to optimization run",
        extra={"event": "run_attached", "cursor": cursor, **log_context},
    )
    try:
        while True:
            while next_index < len(run.events):
                seq, frame = run.events[next_index]
                next_index += 1
                if seq <= cursor:
                    continue
                yield f"id: {seq}\n{frame}"
                next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
            if run.state is not RunState.running and next_index >= len(run.events):
                return
            if epoch != run.attachment_epoch:
                log.info(
                    "optimization run attachment superseded",
                    extra={"event": "run_attachment_superseded", **log_context},
                )
                # Terminal for this ATTACHMENT, not the run: without a
                # sentinel the consumer's decoder would report a truncated
                # stream and reconnect — superseding the newer attachment in
                # turn, ping-ponging forever. No `id:` line on purpose; the
                # frame is attachment-scoped, not part of the run's log.
                yield "event: superseded\ndata: {}\n\n"
                return
            if await request.is_disconnected():
                return
            await run.wait_for_change(_TAIL_POLL_SECONDS)
            if loop.time() >= next_heartbeat:
                yield ": heartbeat\n\n"
                next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
    finally:
        run.end_attachment(epoch)
        log.info(
            "consumer detached from optimization run",
            extra={"event": "run_detached", **log_context},
        )


class OptimizationRunRegistry:
    """All detached runs, plus the reaper that bounds their lifetimes.

    The reaper cancels a running run with no attached consumer for the detach
    grace period, and drops a terminal run's log after the retention period
    (the StatusStore keeps the status row as before).
    """

    def __init__(
        self,
        *,
        detach_grace_seconds: float | None = None,
        retention_seconds: float | None = None,
    ) -> None:
        self.detach_grace_seconds = (
            detach_grace_seconds_from_environment()
            if detach_grace_seconds is None
            else detach_grace_seconds
        )
        if retention_seconds is not None:
            self.retention_seconds = retention_seconds
        elif self.detach_grace_seconds > 0:
            self.retention_seconds = self.detach_grace_seconds
        else:
            self.retention_seconds = DEFAULT_DETACH_GRACE_SECONDS
        self._runs: dict[str, OptimizationRun] = {}
        self._reaper_task: asyncio.Task[None] | None = None

    def get(self, run_id: str) -> OptimizationRun | None:
        return self._runs.get(run_id)

    def runs(self) -> list[OptimizationRun]:
        return list(self._runs.values())

    def has_live_run_for_account(self, account_id: str) -> bool:
        """Whether the account owns a run that is still running."""
        return any(
            run.account_id == account_id and run.state is RunState.running
            for run in self._runs.values()
        )

    def create_run(
        self,
        app: Any,
        *,
        run_id: str,
        optimizer: Any,
        cleanup: Callable[[], Awaitable[None]],
        correlation: Mapping[str, str | None] | None = None,
        account_id: str | None = None,
    ) -> OptimizationRun:
        """Register a run and start the background pump driving its study."""
        run = OptimizationRun(
            run_id=run_id,
            optimizer=optimizer,
            cleanup=cleanup,
            correlation=correlation,
            account_id=account_id,
            requested_trials=int(getattr(optimizer, "n_trials", 0) or 0),
        )
        self._runs[run_id] = run
        run.task = asyncio.create_task(
            self._drive_run(app, run), name=f"petrinaut-run-{run_id}"
        )
        self._ensure_reaper()
        return run

    async def _drive_run(self, app: Any, run: OptimizationRun) -> None:
        """Pump one run to a terminal state, then release its resources."""
        state = RunState.failed
        cancellation: asyncio.CancelledError | None = None
        # The pump records its outcome right before returning — ahead of its
        # cancellable session-shutdown finally — so a cancellation landing in
        # that teardown window cannot relabel an already-decided study.
        recorded_outcomes: list[str] = []
        try:
            state = RunState(
                await run.optimizer.pump_events(
                    app,
                    run.run_id,
                    run.optimizer.n_trials,
                    on_event=run.append_event,
                    cancel_event=run.cancel_requested,
                    on_outcome=recorded_outcomes.append,
                    correlation=run.correlation,
                )
            )
        except asyncio.CancelledError as error:
            # Service shutdown cancels the pump task; the pump's own finally
            # already closed the session on its way out. Keep a decided outcome:
            # its terminal frame is already in the log, and appending a
            # cancelled frame after it would corrupt the replay.
            state = (
                RunState(recorded_outcomes[0])
                if recorded_outcomes
                else RunState.cancelled
            )
            cancellation = error
        except Exception as error:
            # Backstop only: the pump reports study failures itself. The raw
            # message may quote user content, so log its type only.
            log.error(
                "optimization run pump failed",
                extra={
                    "event": "run_pump_failed",
                    "run_id": run.run_id,
                    "error_type": type(error).__name__,
                    **run.correlation,
                },
            )
            run.append_event(
                'data: {"state": "ERROR", "message": "optimization run failed"}\n\n'
            )
            with suppress(Exception):
                set_status(
                    app,
                    run.run_id,
                    phase=Phase.error,
                    detail="optimization run failed",
                )
        finally:
            try:
                if state is RunState.cancelled:
                    run.append_event(CANCELLED_FRAME)
                    with suppress(Exception):
                        set_status(
                            app,
                            run.run_id,
                            phase=Phase.idle,
                            detail=run.cancel_reason,
                        )
                    log.info(
                        "optimization run cancelled",
                        extra={
                            "event": "run_cancelled",
                            "run_id": run.run_id,
                            "detail": run.cancel_reason,
                            **run.correlation,
                        },
                    )
                await asyncio.shield(run.cleanup())
            finally:
                run.mark_terminal(state)
        if cancellation is not None:
            raise cancellation

    def _ensure_reaper(self) -> None:
        if self._reaper_task is None or self._reaper_task.done():
            self._reaper_task = asyncio.create_task(
                self._reap_loop(), name="petrinaut-run-reaper"
            )

    @property
    def _tick_seconds(self) -> float:
        horizons = [self.retention_seconds]
        if self.detach_grace_seconds > 0:
            horizons.append(self.detach_grace_seconds)
        return max(0.01, min(1.0, min(horizons) / 10))

    async def _reap_loop(self) -> None:
        while True:
            await asyncio.sleep(self._tick_seconds)
            now = asyncio.get_running_loop().time()
            for run in self.runs():
                try:
                    self._reap_one(run, now)
                except Exception:
                    # One bad run must not stop the reaper: an unreaped
                    # orphan would otherwise hold its slot forever (the loop
                    # is only recreated by the next create_run).
                    log.exception(
                        "optimization run reaping failed",
                        extra={"event": "run_reap_failed", "run_id": run.run_id},
                    )

    def _reap_one(self, run: OptimizationRun, now: float) -> None:
        if run.state is RunState.running:
            if (
                self.detach_grace_seconds > 0
                and not run.attached
                and now - run.last_detached_at >= self.detach_grace_seconds
                and run.request_cancel(
                    "no attached consumer within the detach grace period"
                )
            ):
                log.warning(
                    "optimization run reaped: no attached consumer",
                    extra={
                        "event": "run_reaped",
                        "run_id": run.run_id,
                        "detach_grace_seconds": self.detach_grace_seconds,
                        **run.correlation,
                    },
                )
        elif (
            run.terminal_at is not None
            and now - run.terminal_at >= self.retention_seconds
        ):
            del self._runs[run.run_id]
            log.info(
                "optimization run log expired",
                extra={
                    "event": "run_expired",
                    "run_id": run.run_id,
                    **run.correlation,
                },
            )

    async def shutdown(self) -> None:
        """Cancel the reaper and every pump; used by the app's lifespan."""
        tasks: list[asyncio.Task[None]] = []
        if self._reaper_task is not None:
            self._reaper_task.cancel()
            tasks.append(self._reaper_task)
            self._reaper_task = None
        for run in self.runs():
            if run.task is not None and not run.task.done():
                if not run.cancel_requested.is_set():
                    run.cancel_reason = "service shutting down"
                run.task.cancel()
                tasks.append(run.task)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
