import asyncio
import logging
import threading
from collections.abc import Awaitable, Callable, Mapping
from typing import override

import pytest

from petrinaut_optimization import optimization_runs
from petrinaut_optimization.events import EventBus
from petrinaut_optimization.optimization_runs import (
    CANCELLED_FRAME,
    DETACH_GRACE_ENVIRONMENT_VARIABLE,
    OptimizationRun,
    OptimizationRunRegistry,
    RunOptimizer,
    RunState,
    attachment_event_stream,
    detach_grace_seconds_from_environment,
)
from petrinaut_optimization.petrinaut_optimizer import PetrinautOptimizer
from petrinaut_optimization.status import Phase, StatusStore, StatusStoreUpdateEvent
from petrinaut_optimizer_core import Scalar

FIRST_FRAME = (
    'data: {"step": 0, "params": {"rate": 1.0}, '
    '"init_state": {}, "metric": 2.0, "state": "COMPLETE"}\n\n'
)
DONE_FRAME = "event: done\ndata: {}\n\n"


def connected() -> asyncio.Future[bool]:
    """Supply an immediately completed disconnect poll to the attachment API."""
    result = asyncio.get_running_loop().create_future()
    result.set_result(False)
    return result


class DisconnectingRequest:
    def __init__(self) -> None:
        self.polls = 0

    async def is_disconnected(self) -> bool:
        self.polls += 1
        return self.polls > 1


class HoldingPumpOptimizer(RunOptimizer):
    """Pump double that emits one frame, then waits for cancellation."""

    n_trials = 1

    def __init__(self, bus: EventBus[StatusStoreUpdateEvent]) -> None:
        self.bus = bus
        self.pump_started = asyncio.Event()

    @override
    async def pump_events(
        self,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Callable[[str], object],
        cancel_event: asyncio.Event,
        on_outcome: Callable[[str], object] | None = None,
        correlation: Mapping[str, str | None] | None = None,
    ) -> str:
        del correlation
        on_event(FIRST_FRAME)
        self.pump_started.set()
        await cancel_event.wait()
        if on_outcome is not None:
            on_outcome("cancelled")
        return "cancelled"


class CompletingPumpOptimizer(RunOptimizer):
    """Pump double that finishes immediately with a done frame."""

    n_trials = 1

    def __init__(self, bus: EventBus[StatusStoreUpdateEvent]) -> None:
        self.bus = bus

    @override
    async def pump_events(
        self,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Callable[[str], object],
        cancel_event: asyncio.Event,
        on_outcome: Callable[[str], object] | None = None,
        correlation: Mapping[str, str | None] | None = None,
    ) -> str:
        del cancel_event, correlation
        assert _n_trials == self.n_trials
        on_event(FIRST_FRAME)
        on_event(DONE_FRAME)
        if on_outcome is not None:
            on_outcome("completed")
        return "completed"


class CompletedThenBlockedPumpOptimizer(RunOptimizer):
    """Pump double stuck in its (cancellable) teardown after deciding.

    Mirrors the real engine's shape: the done frame is appended and the
    outcome recorded before the session-shutdown ``finally`` — a cancellable
    window in which ``registry.shutdown()`` may land its cancellation.
    """

    n_trials = 1

    def __init__(self, bus: EventBus[StatusStoreUpdateEvent]) -> None:
        self.bus = bus
        self.teardown_entered = asyncio.Event()

    @override
    async def pump_events(
        self,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Callable[[str], object],
        cancel_event: asyncio.Event,
        on_outcome: Callable[[str], object] | None = None,
        correlation: Mapping[str, str | None] | None = None,
    ) -> str:
        del cancel_event, correlation
        on_event(FIRST_FRAME)
        on_event(DONE_FRAME)
        if on_outcome is not None:
            on_outcome("completed")
        self.teardown_entered.set()
        await asyncio.Event().wait()
        return "completed"


class CrashingPumpOptimizer(RunOptimizer):
    """Pump double whose engine fails outside the study contract."""

    n_trials = 1

    def __init__(self, bus: EventBus[StatusStoreUpdateEvent]) -> None:
        self.bus = bus

    @override
    async def pump_events(
        self,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Callable[[str], object],
        cancel_event: asyncio.Event,
        on_outcome: Callable[[str], object] | None = None,
        correlation: Mapping[str, str | None] | None = None,
    ) -> str:
        del on_event, cancel_event, on_outcome, correlation
        assert not self.bus.closed
        raise RuntimeError("pump crashed: user_secret_xyz")


def _cleanup_recorder() -> tuple[list[int], Callable[[], Awaitable[None]]]:
    calls: list[int] = []

    def cleanup() -> asyncio.Future[None]:
        calls.append(1)
        result = asyncio.get_running_loop().create_future()
        result.set_result(None)
        return result

    return calls, cleanup


def _status_bus_with_run() -> tuple[StatusStore, str, EventBus[StatusStoreUpdateEvent]]:
    bus = EventBus[StatusStoreUpdateEvent]()
    statuses = StatusStore()
    statuses.subscribe(event_bus=bus)
    return statuses, statuses.create().run_id, bus


def test_grace_env_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, raising=False)
    assert detach_grace_seconds_from_environment() == pytest.approx(300.0, rel=0, abs=0)

    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, "12.5")
    assert detach_grace_seconds_from_environment() == pytest.approx(12.5, rel=0, abs=0)

    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, "not-a-number")
    assert detach_grace_seconds_from_environment() == pytest.approx(300.0, rel=0, abs=0)

    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, "0")
    assert detach_grace_seconds_from_environment() == pytest.approx(0.0, rel=0, abs=0)


@pytest.mark.parametrize("raw", ["inf", "-inf", "nan", "1e400"])
def test_grace_env_nonfinite(monkeypatch: pytest.MonkeyPatch, raw: str) -> None:
    """`float()` accepts inf/nan spellings, which must not become a period."""
    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, raw)
    assert detach_grace_seconds_from_environment() == pytest.approx(300.0, rel=0, abs=0)


@pytest.mark.asyncio
async def test_event_log_sequence() -> None:
    _calls, cleanup = _cleanup_recorder()
    run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
    assert run.append_event(FIRST_FRAME) == 1
    assert run.append_event(DONE_FRAME) == 2
    assert run.events == [(1, FIRST_FRAME), (2, DONE_FRAME)]
    run.mark_terminal(RunState.completed)
    await asyncio.wait_for(run.finished.wait(), 1)


@pytest.mark.asyncio
async def test_attachment_terminal_cursor() -> None:
    _calls, cleanup = _cleanup_recorder()
    run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
    run.append_event(FIRST_FRAME)
    run.append_event(FIRST_FRAME)
    run.append_event(DONE_FRAME)
    run.mark_terminal(RunState.completed)

    epoch = run.begin_attachment()
    frames = [
        frame
        async for frame in attachment_event_stream(
            run, cursor=2, epoch=epoch, is_disconnected=connected
        )
    ]
    assert run.attached is False

    assert frames == [f"id: 3\n{DONE_FRAME}"]


@pytest.mark.asyncio
async def test_attachment_replay_tail() -> None:
    _calls, cleanup = _cleanup_recorder()
    run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
    run.append_event(FIRST_FRAME)
    epoch = run.begin_attachment()
    stream = attachment_event_stream(run, cursor=0, epoch=epoch, is_disconnected=connected)
    frames = [await anext(stream)]

    async def append_rest() -> None:
        run.append_event(FIRST_FRAME)
        await asyncio.sleep(0)
        run.append_event(DONE_FRAME)
        run.mark_terminal(RunState.completed)

    appender = asyncio.create_task(append_rest())
    frames.extend([frame async for frame in stream])
    await appender

    assert frames == [
        f"id: 1\n{FIRST_FRAME}",
        f"id: 2\n{FIRST_FRAME}",
        f"id: 3\n{DONE_FRAME}",
    ]


@pytest.mark.asyncio
async def test_attachment_oversized_cursor() -> None:
    """An out-of-range cursor must not swallow later frames or the terminal."""
    _calls, cleanup = _cleanup_recorder()
    run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
    run.append_event(FIRST_FRAME)
    epoch = run.begin_attachment()
    stream = attachment_event_stream(run, cursor=999, epoch=epoch, is_disconnected=connected)

    async def append_rest() -> None:
        await asyncio.sleep(0.01)
        run.append_event(FIRST_FRAME)
        run.append_event(DONE_FRAME)
        run.mark_terminal(RunState.completed)

    appender = asyncio.create_task(append_rest())
    frames = [frame async for frame in stream if not frame.startswith(": heartbeat")]
    await appender

    # The clamped cursor skips the already-buffered frame but delivers every
    # frame appended after attaching, including the terminal one.
    assert frames == [f"id: 2\n{FIRST_FRAME}", f"id: 3\n{DONE_FRAME}"]


@pytest.mark.asyncio
async def test_attachment_epoch_supersession() -> None:
    _calls, cleanup = _cleanup_recorder()
    run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
    run.append_event(FIRST_FRAME)

    first_epoch = run.begin_attachment()
    first_stream = attachment_event_stream(
        run, cursor=0, epoch=first_epoch, is_disconnected=connected
    )
    assert await anext(first_stream) == f"id: 1\n{FIRST_FRAME}"

    second_epoch = run.begin_attachment()
    # The superseded stream ends with the attachment-scoped sentinel (no
    # id line), then closes. Bounded so a supersession regression fails
    # fast instead of stalling until the ~30s heartbeat.
    assert (
        await asyncio.wait_for(anext(first_stream), timeout=1) == "event: superseded\ndata: {}\n\n"
    )
    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(anext(first_stream), timeout=1)
    # The stale attachment must not clear the newer one's attached mark.
    assert run.attached is True

    second_stream = attachment_event_stream(
        run, cursor=0, epoch=second_epoch, is_disconnected=connected
    )
    assert await anext(second_stream) == f"id: 1\n{FIRST_FRAME}"
    await second_stream.aclose()
    assert run.attached is False


@pytest.mark.asyncio
async def test_attachment_disconnect_detaches() -> None:
    _calls, cleanup = _cleanup_recorder()
    run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
    run.append_event(FIRST_FRAME)
    epoch = run.begin_attachment()
    frames = [
        frame
        async for frame in attachment_event_stream(
            run,
            cursor=0,
            epoch=epoch,
            is_disconnected=DisconnectingRequest().is_disconnected,
        )
    ]
    assert frames == [f"id: 1\n{FIRST_FRAME}"]
    assert run.attached is False
    assert run.state is RunState.running


@pytest.mark.asyncio
async def test_registry_orphan_reaped(caplog: pytest.LogCaptureFixture) -> None:
    statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=0.05, retention_seconds=60)
    calls, cleanup = _cleanup_recorder()
    with caplog.at_level(logging.WARNING, logger="pn_runs"):
        run = registry.create_run(
            run_id=run_id,
            optimizer=HoldingPumpOptimizer(bus),
            cleanup=cleanup,
            correlation={"request_id": "request-reap-1"},
        )
        try:
            await asyncio.wait_for(run.finished.wait(), 2)
            assert run.state is RunState.cancelled
            assert run.events[-1] == (2, CANCELLED_FRAME)
            assert calls == [1]
            await bus.drain()
            status = statuses.get(run_id)
            assert status is not None
            assert status.phase is Phase.idle
        finally:
            await registry.shutdown()
            await bus.shutdown()

    reaped = next(
        record for record in caplog.records if getattr(record, "event", None) == "run_reaped"
    )
    assert vars(reaped)["request_id"] == "request-reap-1"


@pytest.mark.asyncio
async def test_registry_attached_spared() -> None:
    _statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=0.05, retention_seconds=60)
    _calls, cleanup = _cleanup_recorder()
    optimizer = HoldingPumpOptimizer(bus)
    run = registry.create_run(run_id=run_id, optimizer=optimizer, cleanup=cleanup)
    try:
        await asyncio.wait_for(optimizer.pump_started.wait(), 1)
        run.begin_attachment()
        await asyncio.sleep(0.2)
        assert run.state is RunState.running
    finally:
        await registry.shutdown()
        await bus.shutdown()


@pytest.mark.asyncio
async def test_registry_zero_grace_disabled() -> None:
    _statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=0)
    _calls, cleanup = _cleanup_recorder()
    optimizer = HoldingPumpOptimizer(bus)
    run = registry.create_run(run_id=run_id, optimizer=optimizer, cleanup=cleanup)
    try:
        await asyncio.wait_for(optimizer.pump_started.wait(), 1)
        await asyncio.sleep(0.1)
        assert run.state is RunState.running
    finally:
        await registry.shutdown()
        await bus.shutdown()


@pytest.mark.asyncio
async def test_registry_retention_expires() -> None:
    statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=60, retention_seconds=0.05)
    _calls, cleanup = _cleanup_recorder()
    run = registry.create_run(
        run_id=run_id, optimizer=CompletingPumpOptimizer(bus), cleanup=cleanup
    )
    try:
        await asyncio.wait_for(run.finished.wait(), 2)
        for _ in range(200):
            if registry.get(run_id) is None:
                break
            await asyncio.sleep(0.01)
        assert registry.get(run_id) is None
        # The status row outlives the replay log, as before.
        await bus.drain()
        assert statuses.get(run_id) is not None
    finally:
        await registry.shutdown()
        await bus.shutdown()


@pytest.mark.asyncio
async def test_registry_shutdown_cancel() -> None:
    _statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=0)
    calls, cleanup = _cleanup_recorder()
    optimizer = HoldingPumpOptimizer(bus)
    run = registry.create_run(run_id=run_id, optimizer=optimizer, cleanup=cleanup)
    await asyncio.wait_for(optimizer.pump_started.wait(), 1)

    await registry.shutdown()
    await bus.shutdown()

    assert run.state is RunState.cancelled
    assert run.cancel_reason == "service shutting down"
    assert run.events[-1] == (2, CANCELLED_FRAME)
    assert calls == [1]


@pytest.mark.asyncio
async def test_registry_decided_completion() -> None:
    """A cancel landing after `done` must not relabel the run as cancelled."""
    _statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=0)
    calls, cleanup = _cleanup_recorder()
    optimizer = CompletedThenBlockedPumpOptimizer(bus)
    run = registry.create_run(run_id=run_id, optimizer=optimizer, cleanup=cleanup)
    await asyncio.wait_for(optimizer.teardown_entered.wait(), 1)

    await registry.shutdown()
    await bus.shutdown()

    assert run.state is RunState.completed
    # The event log ends with the single decided terminal frame; no
    # cancelled frame is appended after it.
    assert run.events == [(1, FIRST_FRAME), (2, DONE_FRAME)]
    assert calls == [1]


class SlowCloseStudyModel:
    """Real-optimizer model whose session close blocks until released."""

    def __init__(self, description: dict[str, object]) -> None:
        self.description = description
        self.close_started = threading.Event()
        self.close_release = threading.Event()
        self.close_calls: list[bool] = []

    def describe(self) -> dict[str, object]:
        return self.description

    @staticmethod
    def objective(_parameter_values: dict[str, Scalar]) -> float:
        return 1.0

    def close(self, *, graceful: bool = True) -> None:
        self.close_started.set()
        self.close_release.wait(timeout=2)
        self.close_calls.append(graceful)


@pytest.mark.asyncio
async def test_pump_close_completed(
    optimization_description: dict[str, object],
) -> None:
    """The real engine records its outcome before the cancellable close."""
    statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=0)
    calls, cleanup = _cleanup_recorder()
    model = SlowCloseStudyModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=bus)
    run = registry.create_run(run_id=run_id, optimizer=optimizer, cleanup=cleanup)
    try:
        # The study finishes, the done frame lands, then the pump blocks
        # in its session-shutdown finally; cancel it right there.
        await asyncio.to_thread(model.close_started.wait, 2)
        assert run.task is not None
        run.task.cancel()
        model.close_release.set()
        await asyncio.gather(run.task, return_exceptions=True)

        assert run.state is RunState.completed
        assert run.events[-1][1] == DONE_FRAME
        assert CANCELLED_FRAME not in [frame for _seq, frame in run.events]
        assert calls == [1]
        await bus.drain()
        status = statuses.get(run_id)
        assert status is not None
        assert status.phase is Phase.done
    finally:
        model.close_release.set()
        await registry.shutdown()
        await bus.shutdown()


@pytest.mark.asyncio
async def test_pump_crash_sanitized(caplog: pytest.LogCaptureFixture) -> None:
    _statuses, run_id, bus = _status_bus_with_run()
    registry = OptimizationRunRegistry(detach_grace_seconds=60)
    calls, cleanup = _cleanup_recorder()
    with caplog.at_level(logging.ERROR, logger="pn_runs"):
        run = registry.create_run(
            run_id=run_id, optimizer=CrashingPumpOptimizer(bus), cleanup=cleanup
        )
        try:
            await asyncio.wait_for(run.finished.wait(), 2)
            assert run.state is RunState.failed
            assert run.events == [
                (
                    1,
                    'data: {"state": "ERROR", "message": "optimization run failed"}\n\n',
                )
            ]
            assert calls == [1]
        finally:
            await registry.shutdown()
            await bus.shutdown()

    failure = next(
        record for record in caplog.records if getattr(record, "event", None) == "run_pump_failed"
    )
    assert vars(failure)["error_type"] == "RuntimeError"
    # The raw pump error may quote user content, so it is never logged or
    # replayed to consumers.
    assert "user_secret_xyz" not in failure.getMessage()


@pytest.mark.asyncio
async def test_attachment_heartbeat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(optimization_runs, "SSE_HEARTBEAT_SECONDS", 0.01)

    _calls, cleanup = _cleanup_recorder()
    run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
    epoch = run.begin_attachment()
    stream = attachment_event_stream(run, cursor=0, epoch=epoch, is_disconnected=connected)
    frames = [await anext(stream)]
    run.append_event(DONE_FRAME)
    run.mark_terminal(RunState.completed)
    frames.extend([frame async for frame in stream])

    assert frames[0] == ": heartbeat\n\n"
    assert frames[-1] == f"id: 1\n{DONE_FRAME}"
