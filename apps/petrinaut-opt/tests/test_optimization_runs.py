from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

import pytest
from fastapi import FastAPI

from src import optimization_runs
from src.petrinaut_optimizer import PetrinautOptimizer
from src.optimization_runs import (
    CANCELLED_FRAME,
    DETACH_GRACE_ENVIRONMENT_VARIABLE,
    OptimizationRun,
    OptimizationRunRegistry,
    RunState,
    attachment_event_stream,
    detach_grace_seconds_from_environment,
)
from src.utils import Phase, StatusStore


FIRST_FRAME = (
    'data: {"step": 0, "params": {"rate": 1.0}, '
    '"init_state": {}, "metric": 2.0, "state": "COMPLETE"}\n\n'
)
DONE_FRAME = "event: done\ndata: {}\n\n"


class ConnectedRequest:
    headers: dict[str, str] = {}

    async def is_disconnected(self) -> bool:
        return False


class DisconnectingRequest(ConnectedRequest):
    def __init__(self) -> None:
        self.polls = 0

    async def is_disconnected(self) -> bool:
        self.polls += 1
        return self.polls > 1


class HoldingPumpOptimizer:
    """Pump double that emits one frame, then waits for cancellation."""

    n_trials = 1

    def __init__(self) -> None:
        self.pump_started = asyncio.Event()

    async def pump_events(
        self,
        _app: Any,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Any,
        cancel_event: asyncio.Event,
        on_outcome: Any = None,
        correlation: Any = None,
    ) -> str:
        on_event(FIRST_FRAME)
        self.pump_started.set()
        await cancel_event.wait()
        if on_outcome is not None:
            on_outcome("cancelled")
        return "cancelled"


class CompletingPumpOptimizer:
    """Pump double that finishes immediately with a done frame."""

    n_trials = 1

    async def pump_events(
        self,
        _app: Any,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Any,
        cancel_event: asyncio.Event,
        on_outcome: Any = None,
        correlation: Any = None,
    ) -> str:
        on_event(FIRST_FRAME)
        on_event(DONE_FRAME)
        if on_outcome is not None:
            on_outcome("completed")
        return "completed"


class CompletedThenBlockedPumpOptimizer:
    """Pump double stuck in its (cancellable) teardown after deciding.

    Mirrors the real engine's shape: the done frame is appended and the
    outcome recorded before the CLI-shutdown ``finally`` — a cancellable
    window in which ``registry.shutdown()`` may land its cancellation.
    """

    n_trials = 1

    def __init__(self) -> None:
        self.teardown_entered = asyncio.Event()

    async def pump_events(
        self,
        _app: Any,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Any,
        cancel_event: asyncio.Event,
        on_outcome: Any = None,
        correlation: Any = None,
    ) -> str:
        on_event(FIRST_FRAME)
        on_event(DONE_FRAME)
        if on_outcome is not None:
            on_outcome("completed")
        self.teardown_entered.set()
        await asyncio.Event().wait()
        return "completed"


class CrashingPumpOptimizer:
    """Pump double whose engine fails outside the study contract."""

    n_trials = 1

    async def pump_events(self, *_args: Any, **_kwargs: Any) -> str:
        raise RuntimeError("pump crashed: user_secret_xyz")


def _cleanup_recorder() -> tuple[list[int], Any]:
    calls: list[int] = []

    async def cleanup() -> None:
        calls.append(1)

    return calls, cleanup


def _status_app_with_run() -> tuple[FastAPI, str]:
    app = FastAPI()
    app.state.statuses = StatusStore()
    return app, app.state.statuses.create().run_id


def test_detach_grace_environment_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, raising=False)
    assert detach_grace_seconds_from_environment() == 300.0

    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, "12.5")
    assert detach_grace_seconds_from_environment() == 12.5

    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, "not-a-number")
    assert detach_grace_seconds_from_environment() == 300.0

    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, "0")
    assert detach_grace_seconds_from_environment() == 0.0


@pytest.mark.parametrize("raw", ["inf", "-inf", "nan", "1e400"])
def test_detach_grace_rejects_non_finite_values(
    monkeypatch: pytest.MonkeyPatch, raw: str
) -> None:
    """`float()` accepts inf/nan spellings, which must not become a period."""
    monkeypatch.setenv(DETACH_GRACE_ENVIRONMENT_VARIABLE, raw)
    assert detach_grace_seconds_from_environment() == 300.0


def test_event_log_sequences_start_at_one_and_increment() -> None:
    async def scenario() -> None:
        _calls, cleanup = _cleanup_recorder()
        run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
        assert run.append_event(FIRST_FRAME) == 1
        assert run.append_event(DONE_FRAME) == 2
        assert run.events == [(1, FIRST_FRAME), (2, DONE_FRAME)]

    asyncio.run(scenario())


def test_attachment_replays_past_the_cursor_and_closes_on_terminal() -> None:
    async def scenario() -> list[str]:
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
                run, cursor=2, epoch=epoch, request=ConnectedRequest()
            )
        ]
        assert run.attached is False
        return frames

    frames = asyncio.run(scenario())

    assert frames == [f"id: 3\n{DONE_FRAME}"]


def test_attachment_tails_live_appends_after_the_replay() -> None:
    async def scenario() -> list[str]:
        _calls, cleanup = _cleanup_recorder()
        run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
        run.append_event(FIRST_FRAME)
        epoch = run.begin_attachment()
        stream = attachment_event_stream(
            run, cursor=0, epoch=epoch, request=ConnectedRequest()
        )
        frames = [await anext(stream)]

        async def append_rest() -> None:
            run.append_event(FIRST_FRAME)
            await asyncio.sleep(0)
            run.append_event(DONE_FRAME)
            run.mark_terminal(RunState.completed)

        appender = asyncio.create_task(append_rest())
        async for frame in stream:
            frames.append(frame)
        await appender
        return frames

    frames = asyncio.run(scenario())

    assert frames == [
        f"id: 1\n{FIRST_FRAME}",
        f"id: 2\n{FIRST_FRAME}",
        f"id: 3\n{DONE_FRAME}",
    ]


def test_attachment_with_a_cursor_past_the_log_end_still_tails_live_events() -> None:
    """An out-of-range cursor must not swallow later frames or the terminal."""

    async def scenario() -> list[str]:
        _calls, cleanup = _cleanup_recorder()
        run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
        run.append_event(FIRST_FRAME)
        epoch = run.begin_attachment()
        stream = attachment_event_stream(
            run, cursor=999, epoch=epoch, request=ConnectedRequest()
        )

        async def append_rest() -> None:
            await asyncio.sleep(0.01)
            run.append_event(FIRST_FRAME)
            run.append_event(DONE_FRAME)
            run.mark_terminal(RunState.completed)

        appender = asyncio.create_task(append_rest())
        frames = [
            frame async for frame in stream if not frame.startswith(": heartbeat")
        ]
        await appender
        return frames

    frames = asyncio.run(scenario())

    # The clamped cursor skips the already-buffered frame but delivers every
    # frame appended after attaching, including the terminal one.
    assert frames == [f"id: 2\n{FIRST_FRAME}", f"id: 3\n{DONE_FRAME}"]


def test_a_second_attachment_supersedes_the_first() -> None:
    async def scenario() -> None:
        _calls, cleanup = _cleanup_recorder()
        run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
        run.append_event(FIRST_FRAME)

        first_epoch = run.begin_attachment()
        first_stream = attachment_event_stream(
            run, cursor=0, epoch=first_epoch, request=ConnectedRequest()
        )
        assert await anext(first_stream) == f"id: 1\n{FIRST_FRAME}"

        second_epoch = run.begin_attachment()
        # The superseded stream ends with the attachment-scoped sentinel (no
        # id line), then closes. Bounded so a supersession regression fails
        # fast instead of stalling until the ~30s heartbeat.
        assert (
            await asyncio.wait_for(anext(first_stream), timeout=1)
            == "event: superseded\ndata: {}\n\n"
        )
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(anext(first_stream), timeout=1)
        # The stale attachment must not clear the newer one's attached mark.
        assert run.attached is True

        second_stream = attachment_event_stream(
            run, cursor=0, epoch=second_epoch, request=ConnectedRequest()
        )
        assert await anext(second_stream) == f"id: 1\n{FIRST_FRAME}"
        await second_stream.aclose()
        assert run.attached is False

    asyncio.run(scenario())


def test_a_disconnected_attachment_marks_the_run_detached() -> None:
    async def scenario() -> None:
        _calls, cleanup = _cleanup_recorder()
        run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
        run.append_event(FIRST_FRAME)
        epoch = run.begin_attachment()
        frames = [
            frame
            async for frame in attachment_event_stream(
                run, cursor=0, epoch=epoch, request=DisconnectingRequest()
            )
        ]
        assert frames == [f"id: 1\n{FIRST_FRAME}"]
        assert run.attached is False
        assert run.state is RunState.running

    asyncio.run(scenario())


def test_registry_reaps_a_run_never_attached_within_the_grace_period(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(
            detach_grace_seconds=0.05, retention_seconds=60
        )
        calls, cleanup = _cleanup_recorder()
        run = registry.create_run(
            app,
            run_id=run_id,
            optimizer=HoldingPumpOptimizer(),
            cleanup=cleanup,
            correlation={"request_id": "request-reap-1"},
        )
        try:
            await asyncio.wait_for(run.finished.wait(), 2)
            assert run.state is RunState.cancelled
            assert run.events[-1] == (2, CANCELLED_FRAME)
            assert calls == [1]
            status = app.state.statuses.get(run_id)
            assert status is not None
            assert status.phase is Phase.idle
        finally:
            await registry.shutdown()

    with caplog.at_level(logging.WARNING, logger="pn_runs"):
        asyncio.run(scenario())

    reaped = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "run_reaped"
    )
    assert reaped.request_id == "request-reap-1"


def test_registry_does_not_reap_an_attached_run() -> None:
    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(
            detach_grace_seconds=0.05, retention_seconds=60
        )
        _calls, cleanup = _cleanup_recorder()
        optimizer = HoldingPumpOptimizer()
        run = registry.create_run(
            app, run_id=run_id, optimizer=optimizer, cleanup=cleanup
        )
        try:
            await asyncio.wait_for(optimizer.pump_started.wait(), 1)
            run.begin_attachment()
            await asyncio.sleep(0.2)
            assert run.state is RunState.running
        finally:
            await registry.shutdown()

    asyncio.run(scenario())


def test_registry_keeps_disabled_grace_runs_alive() -> None:
    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(detach_grace_seconds=0)
        _calls, cleanup = _cleanup_recorder()
        optimizer = HoldingPumpOptimizer()
        run = registry.create_run(
            app, run_id=run_id, optimizer=optimizer, cleanup=cleanup
        )
        try:
            await asyncio.wait_for(optimizer.pump_started.wait(), 1)
            await asyncio.sleep(0.1)
            assert run.state is RunState.running
        finally:
            await registry.shutdown()

    asyncio.run(scenario())


def test_registry_drops_terminal_run_logs_after_the_retention_window() -> None:
    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(
            detach_grace_seconds=60, retention_seconds=0.05
        )
        _calls, cleanup = _cleanup_recorder()
        run = registry.create_run(
            app, run_id=run_id, optimizer=CompletingPumpOptimizer(), cleanup=cleanup
        )
        try:
            await asyncio.wait_for(run.finished.wait(), 2)
            for _ in range(200):
                if registry.get(run_id) is None:
                    break
                await asyncio.sleep(0.01)
            assert registry.get(run_id) is None
            # The status row outlives the replay log, as before.
            assert app.state.statuses.get(run_id) is not None
        finally:
            await registry.shutdown()

    asyncio.run(scenario())


def test_registry_shutdown_cancels_running_pumps() -> None:
    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(detach_grace_seconds=0)
        calls, cleanup = _cleanup_recorder()
        optimizer = HoldingPumpOptimizer()
        run = registry.create_run(
            app, run_id=run_id, optimizer=optimizer, cleanup=cleanup
        )
        await asyncio.wait_for(optimizer.pump_started.wait(), 1)

        await registry.shutdown()

        assert run.state is RunState.cancelled
        assert run.cancel_reason == "service shutting down"
        assert run.events[-1] == (2, CANCELLED_FRAME)
        assert calls == [1]

    asyncio.run(scenario())


def test_shutdown_during_pump_teardown_keeps_the_decided_outcome() -> None:
    """A cancel landing after `done` must not relabel the run as cancelled."""

    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(detach_grace_seconds=0)
        calls, cleanup = _cleanup_recorder()
        optimizer = CompletedThenBlockedPumpOptimizer()
        run = registry.create_run(
            app, run_id=run_id, optimizer=optimizer, cleanup=cleanup
        )
        await asyncio.wait_for(optimizer.teardown_entered.wait(), 1)

        await registry.shutdown()

        assert run.state is RunState.completed
        # The event log ends with the single decided terminal frame; no
        # cancelled frame is appended after it.
        assert run.events == [(1, FIRST_FRAME), (2, DONE_FRAME)]
        assert calls == [1]

    asyncio.run(scenario())


class SlowCloseStudyModel:
    """Real-optimizer model whose CLI close blocks until released."""

    def __init__(self, description: dict[str, Any]) -> None:
        self.description = description
        self.close_started = threading.Event()
        self.close_release = threading.Event()
        self.close_calls: list[bool] = []

    def describe_optimization(self) -> dict[str, Any]:
        return self.description

    def objective(self, _parameter_values: dict[str, Any]) -> float:
        return 1.0

    def close(self, *, graceful: bool = True) -> None:
        self.close_started.set()
        self.close_release.wait(timeout=2)
        self.close_calls.append(graceful)


def test_cancel_during_the_real_pumps_cli_close_keeps_completed(
    optimization_description: dict,
) -> None:
    """The real engine records its outcome before the cancellable close."""

    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(detach_grace_seconds=0)
        calls, cleanup = _cleanup_recorder()
        model = SlowCloseStudyModel(optimization_description)
        optimizer = PetrinautOptimizer(model)  # type: ignore[arg-type]
        run = registry.create_run(
            app, run_id=run_id, optimizer=optimizer, cleanup=cleanup
        )
        try:
            # The study finishes, the done frame lands, then the pump blocks
            # in its CLI-shutdown finally; cancel it right there.
            await asyncio.to_thread(model.close_started.wait, 2)
            assert run.task is not None
            run.task.cancel()
            model.close_release.set()
            await asyncio.gather(run.task, return_exceptions=True)

            assert run.state is RunState.completed
            assert run.events[-1][1] == DONE_FRAME
            assert CANCELLED_FRAME not in [frame for _seq, frame in run.events]
            assert calls == [1]
            status = app.state.statuses.get(run_id)
            assert status is not None
            assert status.phase is Phase.done
        finally:
            await registry.shutdown()

    asyncio.run(scenario())


def test_a_pump_crash_appends_a_bounded_backstop_error_frame(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def scenario() -> None:
        app, run_id = _status_app_with_run()
        registry = OptimizationRunRegistry(detach_grace_seconds=60)
        calls, cleanup = _cleanup_recorder()
        run = registry.create_run(
            app, run_id=run_id, optimizer=CrashingPumpOptimizer(), cleanup=cleanup
        )
        try:
            await asyncio.wait_for(run.finished.wait(), 2)
            assert run.state is RunState.failed
            assert run.events == [
                (
                    1,
                    'data: {"state": "ERROR", '
                    '"message": "optimization run failed"}\n\n',
                )
            ]
            assert calls == [1]
        finally:
            await registry.shutdown()

    with caplog.at_level(logging.ERROR, logger="pn_runs"):
        asyncio.run(scenario())

    failure = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "run_pump_failed"
    )
    assert failure.error_type == "RuntimeError"
    # The raw pump error may quote user content, so it is never logged or
    # replayed to consumers.
    assert "user_secret_xyz" not in failure.getMessage()


def test_attachment_heartbeats_while_tailing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(optimization_runs, "SSE_HEARTBEAT_SECONDS", 0.01)

    async def scenario() -> list[str]:
        _calls, cleanup = _cleanup_recorder()
        run = OptimizationRun(run_id="r1", optimizer=None, cleanup=cleanup)
        epoch = run.begin_attachment()
        stream = attachment_event_stream(
            run, cursor=0, epoch=epoch, request=ConnectedRequest()
        )
        frames = [await anext(stream)]
        run.append_event(DONE_FRAME)
        run.mark_terminal(RunState.completed)
        async for frame in stream:
            frames.append(frame)
        return frames

    frames = asyncio.run(scenario())

    assert frames[0] == ": heartbeat\n\n"
    assert frames[-1] == f"id: 1\n{DONE_FRAME}"
