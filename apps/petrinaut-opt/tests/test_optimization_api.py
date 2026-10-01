"""Exercise detached HTTP runs and typed service lifetimes."""

import asyncio
import logging
import threading
import time
from collections.abc import AsyncGenerator, Callable, Mapping
from typing import cast

import pytest
from fastapi import Request, Response
from fastapi.testclient import TestClient
from starlette.requests import ClientDisconnect
from starlette.types import Message, Receive, Scope, Send

from petrinaut_optimization import optimization_runs
from petrinaut_optimization import service as service_module
from petrinaut_optimization.api import app, body_limit, context, optimize
from petrinaut_optimization.events import EventBus
from petrinaut_optimization.optimization_runs import CANCELLED_FRAME, RunState
from petrinaut_optimization.petrinaut_optimizer import PetrinautOptimizer, PetrinautOptimizerEvents
from petrinaut_optimization.service import OptimizationService


class RecordingModel:
    """Track how the session is shut down."""

    def __init__(self) -> None:
        self.close_calls: list[bool] = []

    def close(self, *, graceful: bool = True) -> None:
        self.close_calls.append(graceful)


class FakeOptimizer:
    """Minimal pump-driven optimizer double for create-route tests."""

    n_trials = 1

    def __init__(self) -> None:
        self.pn_model = RecordingModel()
        self.bus: EventBus[PetrinautOptimizerEvents]

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
        del cancel_event, correlation  # This completed-run double does not use controls.
        on_event("event: done\ndata: {}\n\n")
        self.pn_model.close(graceful=True)
        if on_outcome is not None:
            on_outcome("completed")
        return "completed"


@pytest.mark.asyncio
async def test_body_limit_chunked_413(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(body_limit, "MAX_REQUEST_BODY_BYTES", 5)
    incoming: asyncio.Queue[Message] = asyncio.Queue()
    incoming.put_nowait({"type": "http.request", "body": b"123", "more_body": True})
    incoming.put_nowait({"type": "http.request", "body": b"456", "more_body": False})
    outgoing: asyncio.Queue[Message] = asyncio.Queue()

    async def downstream(_scope: Scope, receive_body: Receive, _send: Send) -> None:
        while (await receive_body()).get("more_body", False):
            pass

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/optimize/runs",
        "raw_path": b"/optimize/runs",
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("127.0.0.1", 4004),
    }

    await body_limit.RequestBodyLimitMiddleware(downstream)(scope, incoming.get, outgoing.put)

    assert outgoing.get_nowait()["status"] == 413


def test_create_init_log_sanitized(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The backend error string can embed user content, so it must not be logged."""
    backend_message = "Petrinaut failed to load the optimization manifest: user_secret_xyz"

    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> FakeOptimizer:
        del bus
        raise RuntimeError(backend_message)

    monkeypatch.setattr(service_module, "initialize_optimizer", initialize)

    with (
        caplog.at_level("ERROR", logger="pn_api"),
        TestClient(app) as client,
    ):
        response = client.post("/optimize/runs", json=optimization_manifest)

    failures = [
        record
        for record in caplog.records
        if getattr(record, "event", None) == "initialization_failed"
    ]
    assert failures
    record = failures[0]
    assert getattr(record, "error_type", None) == "RuntimeError"
    assert not hasattr(record, "error_category")
    assert not hasattr(record, "error")
    assert "user_secret_xyz" not in record.getMessage()
    # The full message still reaches the requester in the response detail.
    assert "user_secret_xyz" in response.json()["detail"]


def test_create_init_off_loop(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    initializer_thread_ids: list[int] = []

    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> FakeOptimizer:
        initializer_thread_ids.append(threading.get_ident())
        return _with_bus(FakeOptimizer(), bus)

    monkeypatch.setattr(service_module, "initialize_optimizer", initialize)

    with TestClient(app) as client:
        assert client.portal is not None
        event_loop_thread_id = client.portal.call(threading.get_ident)
        response = client.post("/optimize/runs", json=optimization_manifest)

    assert response.status_code == 201
    assert initializer_thread_ids
    assert initializer_thread_ids[0] != event_loop_thread_id


def test_create_capacity_log_request_id(
    optimization_manifest: dict[str, object],
    caplog: pytest.LogCaptureFixture,
) -> None:
    with (
        caplog.at_level(logging.WARNING, logger="pn_api"),
        TestClient(app) as client,
    ):
        _service(client).active_optimizations = service_module.MAX_ACTIVE_OPTIMIZATIONS
        response = client.post(
            "/optimize/runs",
            json=optimization_manifest,
            headers={"x-hash-request-id": "request-cap-1"},
        )

    assert response.status_code == 429
    rejection = next(
        record for record in caplog.records if getattr(record, "event", None) == "capacity_rejected"
    )
    assert getattr(rejection, "request_id", None) == "request-cap-1"
    assert (
        getattr(rejection, "active_optimizations", None) == service_module.MAX_ACTIVE_OPTIMIZATIONS
    )
    assert "manifest" not in rejection.getMessage()


def _service(client: TestClient) -> OptimizationService:
    return cast("OptimizationService", client.app_state["service"])


def _with_bus[T: FakeOptimizer | ScriptedDetachedOptimizer](
    optimizer: T, bus: EventBus[PetrinautOptimizerEvents]
) -> T:
    optimizer.bus = bus
    return optimizer


@pytest.mark.asyncio
async def test_cleanup_twice_one_slot() -> None:
    optimizer = FakeOptimizer()

    service = OptimizationService()
    try:
        service.active_optimizations = 1
        cleanup = service._run_cleanup(cast("PetrinautOptimizer", optimizer))
        await cleanup()
        await cleanup()
        remaining = service.active_optimizations
    finally:
        await service.shutdown()

    assert remaining == 0
    assert optimizer.pn_model.close_calls == [False]


@pytest.mark.asyncio
async def test_create_init_cancel_releases_slot(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = threading.Event()
    finish = threading.Event()
    optimizer = FakeOptimizer()

    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> FakeOptimizer:
        started.set()
        finish.wait(timeout=1)
        return _with_bus(optimizer, bus)

    monkeypatch.setattr(service_module, "initialize_optimizer", initialize)

    service = OptimizationService()
    try:
        task = asyncio.create_task(
            service.create_run(optimization_manifest, account=None, correlation={})
        )
        assert await asyncio.to_thread(started.wait, 1)
        assert service.active_optimizations == 1
        task.cancel()
        finish.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        await service.shutdown()
        remaining = service.active_optimizations
    finally:
        await service.shutdown()

    assert remaining == 0
    assert optimizer.pn_model.close_calls == [False]


@pytest.mark.asyncio
async def test_create_double_cancel_releases_slot(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A cancel racing the init-cancel recovery must not orphan the session."""
    optimizer = FakeOptimizer()
    started = threading.Event()
    finish = threading.Event()

    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> FakeOptimizer:
        started.set()
        finish.wait(timeout=2)
        return _with_bus(optimizer, bus)

    monkeypatch.setattr(service_module, "initialize_optimizer", initialize)

    service = OptimizationService()
    try:
        task = asyncio.create_task(
            service.create_run(optimization_manifest, account=None, correlation={})
        )
        assert await asyncio.to_thread(started.wait, 1)
        assert service.active_optimizations == 1
        task.cancel()
        # Deliver the first cancellation before issuing another.
        await asyncio.sleep(0)
        task.cancel()
        finish.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        await service.shutdown()
        remaining = service.active_optimizations
    finally:
        await service.shutdown()

    assert remaining == 0
    assert optimizer.pn_model.close_calls == [False]


class ScriptedDetachedOptimizer:
    """Pump-driven double for detached-run endpoint tests.

    Emits one data frame, optionally holds (releasable from the test thread,
    cancellable through the run), then finishes with a second data frame and
    the done frame — mirroring the real engine's frame bodies.
    """

    n_trials = 2

    def __init__(self, *, hold: bool = False) -> None:
        self.pn_model = RecordingModel()
        self.bus: EventBus[PetrinautOptimizerEvents]
        self.hold = hold
        self.release = threading.Event()

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
        del correlation  # The scripted frames have no tracing context.
        record_outcome = on_outcome if on_outcome is not None else lambda _o: None
        on_event(
            'data: {"step": 0, "params": {"rate": 1.0}, '
            '"init_state": {}, "metric": 2.0, "state": "COMPLETE"}\n\n'
        )
        while self.hold and not self.release.is_set():
            if cancel_event.is_set():
                self.pn_model.close(graceful=False)
                record_outcome("cancelled")
                return "cancelled"
            await asyncio.sleep(0.005)
        on_event(
            'data: {"step": 1, "params": {"rate": 1.5}, '
            '"init_state": {}, "metric": 3.0, "state": "COMPLETE"}\n\n'
        )
        on_event("event: done\ndata: {}\n\n")
        self.pn_model.close(graceful=True)
        record_outcome("completed")
        return "completed"


def _wait_until(predicate: Callable[[], bool], timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("condition not met within the timeout")


def _event_ids(text: str) -> list[int]:
    return [int(line.removeprefix("id: ")) for line in text.splitlines() if line.startswith("id: ")]


def _attached_request(run_id: str) -> Request:
    """Keep a real Request receive channel open until the consumer closes."""

    async def receive() -> Message:
        await asyncio.Event().wait()
        return {"type": "http.disconnect"}

    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": f"/optimize/runs/{run_id}/events",
            "headers": [],
            "query_string": b"",
        },
        receive=receive,
    )


def _events(service: OptimizationService, run_id: str, cursor: int = 0) -> context.EventsContext:
    return context.EventsContext(
        service=service,
        account=None,
        run_id=run_id,
        request=_attached_request(run_id),
        cursor=cursor,
    )


async def _start_detached_run(
    optimization_manifest: dict[str, object],
    *,
    detach_grace_seconds: float = 300,
) -> tuple[OptimizationService, str]:
    """Create a detached run through the real endpoint, direct-call style.

    The TestClient transport buffers whole response bodies, so tests that
    must read a live SSE attachment incrementally call the endpoints
    directly and drive ``body_iterator`` themselves.
    """
    service = OptimizationService()
    service.runs = optimization_runs.OptimizationRunRegistry(
        detach_grace_seconds=detach_grace_seconds
    )
    payload = await optimize.post_optimize_runs(
        context.RequestContext(service=service, account=None),
        optimization_manifest,
        Response(),
    )
    return service, payload.run_id


async def _attach(
    service: OptimizationService, run_id: str, cursor: int = 0
) -> AsyncGenerator[str]:
    response = await optimize.get_optimize_run_events(_events(service, run_id, cursor))
    return cast("AsyncGenerator[str]", response.body_iterator)


def _frame_ids(frames: list[str]) -> list[int]:
    return [
        int(frame.split("\n", 1)[0].removeprefix("id: "))
        for frame in frames
        if frame.startswith("id: ")
    ]


def test_create_detached_holds_slot(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    with TestClient(app) as client:
        response = client.post("/optimize/runs", json=optimization_manifest)
        assert response.status_code == 201
        run_id = response.json()["run_id"]
        assert response.headers["x-optimization-run-id"] == run_id
        # No consumer is attached, yet the slot stays held by the run.
        assert _service(client).active_optimizations == 1
        run = _service(client).runs.get(run_id)
        assert run is not None
        assert run.state is RunState.running

        optimizer.release.set()
        _wait_until(lambda: _service(client).active_optimizations == 0)
        _wait_until(lambda: run.state is RunState.completed)
        # The pump closed the session gracefully; the idempotent run cleanup adds
        # its prompt close, which the real adapter treats as a no-op.
        assert optimizer.pn_model.close_calls == [True, False]


@pytest.mark.asyncio
async def test_attach_replay_then_live(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    service, run_id = await _start_detached_run(optimization_manifest)
    registry = service.runs
    try:
        response = await optimize.get_optimize_run_events(_events(service, run_id))
        assert response.headers["x-optimization-run-id"] == run_id
        assert response.media_type == "text/event-stream"
        stream = cast("AsyncGenerator[str]", response.body_iterator)
        frames = [await anext(stream)]
        # The buffered first trial replays before any live event.
        assert frames[0].startswith("id: 1\n")
        optimizer.release.set()
        frames.extend([frame async for frame in stream])
        run = registry.get(run_id)
        assert run is not None
        assert run.state is RunState.completed
        assert service.active_optimizations == 0
    finally:
        await service.shutdown()

    assert _frame_ids(frames) == [1, 2, 3]
    assert frames[-1] == "id: 3\nevent: done\ndata: {}\n\n"


def test_attach_cursor_precedence(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer()
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    with TestClient(app) as client:
        run_id = client.post("/optimize/runs", json=optimization_manifest).json()["run_id"]
        run = _service(client).runs.get(run_id)
        assert run is not None
        _wait_until(lambda: run.state is RunState.completed)

        from_cursor = client.get(f"/optimize/runs/{run_id}/events?cursor=1")
        from_header = client.get(f"/optimize/runs/{run_id}/events", headers={"Last-Event-ID": "2"})
        cursor_wins = client.get(
            f"/optimize/runs/{run_id}/events?cursor=0",
            headers={"Last-Event-ID": "2"},
        )

    assert _event_ids(from_cursor.text) == [2, 3]
    assert _event_ids(from_header.text) == [3]
    assert _event_ids(cursor_wins.text) == [1, 2, 3]
    assert cursor_wins.text.endswith("id: 3\nevent: done\ndata: {}\n\n")


@pytest.mark.asyncio
async def test_attach_detach_keeps_run(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    service, run_id = await _start_detached_run(optimization_manifest)
    registry = service.runs
    try:
        run = registry.get(run_id)
        assert run is not None
        stream = await _attach(service, run_id)
        assert (await anext(stream)).startswith("id: 1\n")
        # The consumer drops mid-run; the run must keep its slot and
        # keep optimizing.
        await stream.aclose()
        assert run.attached is False
        assert run.state is RunState.running
        assert service.active_optimizations == 1

        optimizer.release.set()
        await asyncio.wait_for(run.finished.wait(), 2)
        assert run.state is RunState.completed
        assert service.active_optimizations == 0

        # A later attachment replays the full log, then closes.
        replay = await _attach(service, run_id)
        frames = [frame async for frame in replay]
    finally:
        await service.shutdown()

    assert _frame_ids(frames) == [1, 2, 3]
    assert frames[-1] == "id: 3\nevent: done\ndata: {}\n\n"


@pytest.mark.asyncio
async def test_attach_supersession(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    service, run_id = await _start_detached_run(optimization_manifest)
    registry = service.runs
    try:
        first = await _attach(service, run_id)
        first_frame = await anext(first)
        assert first_frame.startswith("id: 1\n")

        second = await _attach(service, run_id)
        # The superseded first stream ends with the attachment-scoped
        # sentinel (no id line: it is not part of the run's log), so its
        # consumer sees a clean, terminal end instead of a truncated
        # stream it would reconnect after; bounded so a supersession
        # regression fails fast instead of stalling until the ~30s
        # heartbeat.
        assert await asyncio.wait_for(anext(first), timeout=1) == "event: superseded\ndata: {}\n\n"
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(anext(first), timeout=1)
        run = registry.get(run_id)
        assert run is not None
        assert run.attached is True

        assert await anext(second) == first_frame
        optimizer.release.set()
        remaining = [frame async for frame in second]
        assert _frame_ids(remaining) == [2, 3]
    finally:
        await service.shutdown()


def test_delete_cancel_once(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    with TestClient(app) as client:
        run_id = client.post("/optimize/runs", json=optimization_manifest).json()["run_id"]
        assert _service(client).active_optimizations == 1

        response = client.delete(f"/optimize/runs/{run_id}")
        assert response.status_code == 204
        run = _service(client).runs.get(run_id)
        assert run is not None
        assert run.state is RunState.cancelled
        assert run.events[-1] == (2, CANCELLED_FRAME)
        # The pump closed the session promptly and the cleanup added its
        # idempotent prompt close; neither waited for a graceful EOF.
        assert optimizer.pn_model.close_calls == [False, False]
        assert _service(client).active_optimizations == 0

        second = client.delete(f"/optimize/runs/{run_id}")
        assert second.status_code == 204
        assert _service(client).active_optimizations == 0
        assert optimizer.pn_model.close_calls == [False, False]

        replay = client.get(f"/optimize/runs/{run_id}/events")

    assert _event_ids(replay.text) == [1, 2]
    assert replay.text.endswith(f"id: 2\n{CANCELLED_FRAME}")


def test_reaper_orphan_cancelled(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv(optimization_runs.DETACH_GRACE_ENVIRONMENT_VARIABLE, "0.05")
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    with (
        caplog.at_level(logging.WARNING, logger="pn_runs"),
        TestClient(app) as client,
    ):
        run_id = client.post("/optimize/runs", json=optimization_manifest).json()["run_id"]
        run = _service(client).runs.get(run_id)
        assert run is not None
        _wait_until(lambda: run.state is RunState.cancelled)
        _wait_until(lambda: _service(client).active_optimizations == 0)
        assert run.events[-1] == (2, CANCELLED_FRAME)

    reaped = next(
        record for record in caplog.records if getattr(record, "event", None) == "run_reaped"
    )
    assert getattr(reaped, "run_id", None) == run_id


@pytest.mark.asyncio
async def test_reaper_attached_spared(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    service, run_id = await _start_detached_run(optimization_manifest, detach_grace_seconds=0.05)
    registry = service.runs
    try:
        run = registry.get(run_id)
        assert run is not None
        stream = await _attach(service, run_id)
        assert (await anext(stream)).startswith("id: 1\n")
        # Stay attached well past several grace periods; the reaper must
        # leave the run alone.
        await asyncio.sleep(0.2)
        assert run.state is RunState.running

        optimizer.release.set()
        remaining = [frame async for frame in stream]
        assert _frame_ids(remaining) == [2, 3]
        assert run.state is RunState.completed
    finally:
        await service.shutdown()


@pytest.mark.parametrize("cancel_send", [False, True])
@pytest.mark.asyncio
async def test_attach_start_failure_detaches(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    *,
    cancel_send: bool,
) -> None:
    """A failed response start must detach even if the iterator never runs."""
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    service, run_id = await _start_detached_run(optimization_manifest)
    registry = service.runs
    try:
        run = registry.get(run_id)
        assert run is not None
        response = await optimize.get_optimize_run_events(_events(service, run_id))
        assert run.attached is True

        async def receive() -> Message:
            await asyncio.Event().wait()
            raise AssertionError("response start must fail before receiving")

        def send(message: Message) -> asyncio.Future[None]:
            assert message["type"] == "http.response.start"
            if cancel_send:
                raise asyncio.CancelledError
            raise OSError("peer disconnected before response headers")

        scope: Scope = {"type": "http", "asgi": {"spec_version": "2.4"}}
        expected = asyncio.CancelledError if cancel_send else ClientDisconnect
        with pytest.raises(expected):
            await response(scope, receive, send)

        assert run.attached is False
        assert run.last_detached_at > run.created_at
        replay = await _attach(service, run_id)
        assert (await anext(replay)).startswith("id: 1\n")
        # Repeating the old response's teardown cannot detach its successor.
        with pytest.raises(expected):
            await response(scope, receive, send)
        assert run.attached
        await replay.aclose()
        registry._reap_one(run, run.last_detached_at + registry.detach_grace_seconds + 1)
        assert run.cancel_requested.is_set()
    finally:
        optimizer.release.set()
        await service.shutdown()


def test_unknown_runs_404() -> None:
    with TestClient(app) as client:
        assert client.get("/optimize/runs/missing/events").status_code == 404
        assert client.delete("/optimize/runs/missing").status_code == 404


def test_create_capacity_429(
    optimization_manifest: dict[str, object],
) -> None:
    with TestClient(app) as client:
        _service(client).active_optimizations = service_module.MAX_ACTIVE_OPTIMIZATIONS
        response = client.post("/optimize/runs", json=optimization_manifest)

    assert response.status_code == 429
    assert response.headers["retry-after"] == str(service_module.RETRY_AFTER_SECONDS)


def test_create_body_limit_413(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(body_limit, "MAX_REQUEST_BODY_BYTES", 8)

    with TestClient(app) as client:
        response = client.post("/optimize/runs", content=b'{"long":true}')

    assert response.status_code == 413


def test_create_init_failure_status(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> object:
        del bus
        raise RuntimeError("manifest rejected by the backend")

    monkeypatch.setattr(service_module, "initialize_optimizer", initialize)

    with TestClient(app) as client:
        response = client.post("/optimize/runs", json=optimization_manifest)
        run_id = response.headers["x-optimization-run-id"]
        assert _service(client).active_optimizations == 0
        assert _service(client).runs.get(run_id) is None
        statuses = client.get("/status")
        run_status = client.get(f"/status/{run_id}")

    assert response.status_code == 500
    assert "manifest rejected by the backend" in response.json()["detail"]
    assert statuses.json() == [
        {
            "phase": "error",
            "detail": "Petrinaut session and Optimization Model could NOT be initialized",
            "updated_at": statuses.json()[0]["updated_at"],
            "run_id": run_id,
        }
    ]
    assert run_status.json() == statuses.json()[0]


def test_owned_runs_admission_visibility(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An owner tag makes the run single-flight and invisible to others."""
    optimizer = ScriptedDetachedOptimizer(hold=True)
    second_optimizer = ScriptedDetachedOptimizer(hold=True)
    optimizers = iter([optimizer, second_optimizer])
    monkeypatch.setattr(
        service_module,
        "initialize_optimizer",
        lambda _manifest, *, bus: _with_bus(next(optimizers), bus),
    )

    with TestClient(app) as client:
        created = client.post(
            "/optimize/runs",
            json=optimization_manifest,
            headers={"x-hash-account-id": "user-1"},
        )
        assert created.status_code == 201
        run_id = created.json()["run_id"]

        # The same account cannot start a second run while this one lives.
        busy = client.post(
            "/optimize/runs",
            json=optimization_manifest,
            headers={"x-hash-account-id": "user-1"},
        )
        assert busy.status_code == 429
        assert busy.json()["detail"] == "An optimization is already running for this account"

        # Another account is admitted normally (global slots permitting).
        other = client.post(
            "/optimize/runs",
            json=optimization_manifest,
            headers={"x-hash-account-id": "user-2"},
        )
        assert other.status_code == 201

        # A foreign or absent tag cannot see the owned run — 404, identical
        # to an unknown id, on both attach and cancel.
        for headers in ({}, {"x-hash-account-id": "user-2"}):
            assert client.get(f"/optimize/runs/{run_id}/events", headers=headers).status_code == 404
            assert client.delete(f"/optimize/runs/{run_id}", headers=headers).status_code == 404

        # The owner attaches and cancels normally; the attachment reports
        # the manifest's requested trial count for synthesized summaries.
        optimizer.release.set()
        second_optimizer.release.set()
        attached = client.get(
            f"/optimize/runs/{run_id}/events",
            headers={"x-hash-account-id": "user-1"},
        )
        assert attached.status_code == 200
        assert attached.headers["x-requested-trials"] == "2"
        assert (
            client.delete(
                f"/optimize/runs/{run_id}",
                headers={"x-hash-account-id": "user-1"},
            ).status_code
            == 204
        )


def test_owned_runs_terminal_releases_account(
    optimization_manifest: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer()
    monkeypatch.setattr(
        service_module, "initialize_optimizer", lambda _manifest, *, bus: _with_bus(optimizer, bus)
    )

    with TestClient(app) as client:
        # Runs created without a tag stay open and never block an account.
        untagged = client.post("/optimize/runs", json=optimization_manifest)
        assert untagged.status_code == 201
        run_id = untagged.json()["run_id"]
        run = _service(client).runs.get(run_id)
        assert run is not None
        assert run.account_id is None
        _wait_until(lambda: run.state is not RunState.running)

        # A terminal run stops blocking its account: the tagged create is
        # admitted even though the (finished) untagged run is retained.
        tagged = client.post(
            "/optimize/runs",
            json=optimization_manifest,
            headers={"x-hash-account-id": "user-1"},
        )
        assert tagged.status_code == 201
        tagged_run = _service(client).runs.get(tagged.json()["run_id"])
        assert tagged_run is not None
        _wait_until(lambda: tagged_run.state is not RunState.running)

        again = client.post(
            "/optimize/runs",
            json=optimization_manifest,
            headers={"x-hash-account-id": "user-1"},
        )
        assert again.status_code == 201


def test_openapi_detached_contract() -> None:
    schema = app.openapi()

    create = schema["paths"]["/optimize/runs"]["post"]
    request_schema = create["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["type"] == "object"
    assert "201" in create["responses"]
    assert "Retry-After" in create["responses"]["429"]["headers"]
    assert "413" in create["responses"]
    assert "500" in create["responses"]

    events = schema["paths"]["/optimize/runs/{run_id}/events"]["get"]
    stream_schema = events["responses"]["200"]["content"]["text/event-stream"]["schema"]
    assert stream_schema["type"] == "string"
    assert "event: cancelled" in events["responses"]["200"]["description"]
    assert "404" in events["responses"]

    run_path = schema["paths"]["/optimize/runs/{run_id}"]
    assert set(run_path) == {"delete"}
    assert "204" in run_path["delete"]["responses"]
    assert "404" in run_path["delete"]["responses"]
