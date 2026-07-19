from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src import optimization_api, optimization_runs
from src.optimization_runs import CANCELLED_FRAME, RunState


class FakeOptimizer:
    n_trials = 1

    async def stream_all(self, *_args: Any, **_kwargs: Any):
        yield (
            'data: {"step": 0, "params": {"rate": 1.0}, '
            '"init_state": {}, "metric": 2.0, "state": "COMPLETE"}\n\n'
        )
        yield "event: done\ndata: {}\n\n"

    async def stream_best(self, *_args: Any, **_kwargs: Any):
        yield (
            'data: {"step": 0, "params": {"rate": 1.0}, '
            '"init_state": {}, "metric": 2.0, "state": "COMPLETE"}\n\n'
        )
        yield "event: done\ndata: {}\n\n"


def test_posts_an_opaque_manifest_to_the_all_sse_route(
    optimization_manifest: dict,
    monkeypatch,
) -> None:
    received: list[dict[str, Any]] = []

    def initialize(manifest: dict[str, Any], **_kwargs: Any) -> FakeOptimizer:
        received.append(manifest)
        return FakeOptimizer()

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize/all", json=optimization_manifest)
        assert optimization_api.app.state.active_optimizations == 0

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"
    assert response.headers["x-optimization-run-id"]
    assert received == [optimization_manifest]
    assert response.text.endswith("event: done\ndata: {}\n\n")


def test_posts_an_opaque_manifest_to_the_best_sse_route(
    optimization_manifest: dict,
    monkeypatch,
) -> None:
    received: list[dict[str, Any]] = []

    def initialize(manifest: dict[str, Any], **_kwargs: Any) -> FakeOptimizer:
        received.append(manifest)
        return FakeOptimizer()

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize/best", json=optimization_manifest)
        assert optimization_api.app.state.active_optimizations == 0

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert received == [optimization_manifest]
    assert response.text.endswith("event: done\ndata: {}\n\n")


def test_get_is_not_retained_for_manifest_routes() -> None:
    with TestClient(optimization_api.app) as client:
        assert client.get("/optimize/all").status_code == 405
        assert client.get("/optimize/best").status_code == 405


def test_rejects_oversized_manifests_on_both_routes(monkeypatch) -> None:
    monkeypatch.setattr(optimization_api, "MAX_REQUEST_BODY_BYTES", 8)

    with TestClient(optimization_api.app) as client:
        all_response = client.post("/optimize/all", content=b'{"long":true}')
        best_response = client.post("/optimize/best", content=b'{"long":true}')

    assert all_response.status_code == 413
    assert best_response.status_code == 413


def test_rejects_an_oversized_chunked_manifest(monkeypatch) -> None:
    monkeypatch.setattr(optimization_api, "MAX_REQUEST_BODY_BYTES", 5)
    incoming = iter(
        [
            {"type": "http.request", "body": b"123", "more_body": True},
            {"type": "http.request", "body": b"456", "more_body": False},
        ]
    )
    outgoing: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        return next(incoming)

    async def send(message: dict[str, Any]) -> None:
        outgoing.append(message)

    async def downstream(_scope, receive_body, _send) -> None:
        while (await receive_body()).get("more_body", False):
            pass

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/optimize/all",
        "raw_path": b"/optimize/all",
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("127.0.0.1", 4004),
    }

    asyncio.run(
        optimization_api.RequestBodyLimitMiddleware(downstream)(scope, receive, send)
    )

    assert outgoing[0]["status"] == 413


def test_reports_initialization_failure_with_the_run_id(
    optimization_manifest: dict,
    monkeypatch,
) -> None:
    def initialize(_manifest: dict[str, Any], **_kwargs: Any) -> FakeOptimizer:
        raise RuntimeError("manifest rejected by CLI")

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize/all", json=optimization_manifest)
        run_id = response.headers["x-optimization-run-id"]
        assert optimization_api.app.state.active_optimizations == 0
        statuses = client.get("/status")
        run_status = client.get(f"/status/{run_id}")

    assert response.status_code == 500
    assert "manifest rejected by CLI" in response.json()["detail"]
    assert statuses.json() == [
        {
            "phase": "error",
            "detail": "Petrinaut CLI and Optimization Model could NOT be initialized",
            "updated_at": statuses.json()[0]["updated_at"],
            "run_id": run_id,
        }
    ]
    assert run_status.json() == statuses.json()[0]


def test_initialization_failure_log_omits_the_raw_error_message(
    optimization_manifest: dict,
    monkeypatch,
    caplog,
) -> None:
    """The CLI error string can embed user content, so it must not be logged."""
    secret = "Petrinaut failed to load the optimization manifest: user_secret_xyz"

    def initialize(_manifest: dict[str, Any], **_kwargs: Any) -> FakeOptimizer:
        raise RuntimeError(secret)

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    with caplog.at_level("ERROR", logger="pn_api"):
        with TestClient(optimization_api.app) as client:
            response = client.post("/optimize/all", json=optimization_manifest)

    failures = [r for r in caplog.records if r.event == "initialization_failed"]
    assert failures
    record = failures[0]
    assert record.error_type == "RuntimeError"
    assert not hasattr(record, "error_category")
    assert not hasattr(record, "error")
    assert "user_secret_xyz" not in record.getMessage()
    # The full message still reaches the requester in the response detail.
    assert "user_secret_xyz" in response.json()["detail"]


def test_initializer_runs_off_the_event_loop(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    initializer_thread_ids: list[int] = []

    def initialize(_manifest: dict[str, Any], **_kwargs: Any) -> FakeOptimizer:
        initializer_thread_ids.append(threading.get_ident())
        return FakeOptimizer()

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    with TestClient(optimization_api.app) as client:
        event_loop_thread_id = client.portal.call(threading.get_ident)
        response = client.post("/optimize/all", json=optimization_manifest)

    assert response.status_code == 200
    assert initializer_thread_ids
    assert initializer_thread_ids[0] != event_loop_thread_id


def test_rejects_studies_above_the_process_local_limit(
    optimization_manifest: dict,
) -> None:
    with TestClient(optimization_api.app) as client:
        optimization_api.app.state.active_optimizations = (
            optimization_api.MAX_ACTIVE_OPTIMIZATIONS
        )
        response = client.post("/optimize/all", json=optimization_manifest)

    assert response.status_code == 429
    assert response.headers["retry-after"] == str(optimization_api.RETRY_AFTER_SECONDS)


def test_capacity_rejection_is_logged_with_the_request_id(
    optimization_manifest: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.WARNING, logger="pn_api"):
        with TestClient(optimization_api.app) as client:
            optimization_api.app.state.active_optimizations = (
                optimization_api.MAX_ACTIVE_OPTIMIZATIONS
            )
            response = client.post(
                "/optimize/all",
                json=optimization_manifest,
                headers={"x-hash-request-id": "request-cap-1"},
            )

    assert response.status_code == 429
    rejection = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "capacity_rejected"
    )
    assert rejection.request_id == "request-cap-1"
    assert rejection.active_optimizations == optimization_api.MAX_ACTIVE_OPTIMIZATIONS
    assert "manifest" not in rejection.getMessage()


class RecordingModel:
    """Track how the CLI adapter is shut down."""

    def __init__(self) -> None:
        self.close_calls: list[bool] = []

    def close(self, *, graceful: bool = True) -> None:
        self.close_calls.append(graceful)


def _admitted_test_app(active_optimizations: int) -> FastAPI:
    test_app = FastAPI()
    test_app.state.optimization_admission_lock = asyncio.Lock()
    test_app.state.active_optimizations = active_optimizations
    return test_app


def _optimizer_with_recording_model() -> FakeOptimizer:
    optimizer = FakeOptimizer()
    optimizer.pn_model = RecordingModel()  # type: ignore[attr-defined]
    return optimizer


def test_releases_admission_slot_when_a_stream_fails() -> None:
    test_app = _admitted_test_app(active_optimizations=1)
    optimizer = _optimizer_with_recording_model()
    cleanup = optimization_api._create_admitted_run_cleanup(
        test_app,
        optimizer,  # type: ignore[arg-type]
    )

    async def failing_stream():
        raise RuntimeError("stream failed")
        yield "unreachable"  # pragma: no cover

    async def consume() -> None:
        with pytest.raises(RuntimeError, match="stream failed"):
            async for _frame in optimization_api._stream_with_cleanup(
                failing_stream(), cleanup
            ):
                pass

    asyncio.run(consume())

    assert test_app.state.active_optimizations == 0
    assert optimizer.pn_model.close_calls == [False]  # type: ignore[attr-defined]


def test_admitted_run_cleanup_releases_the_slot_exactly_once() -> None:
    test_app = _admitted_test_app(active_optimizations=1)
    optimizer = _optimizer_with_recording_model()
    cleanup = optimization_api._create_admitted_run_cleanup(
        test_app,
        optimizer,  # type: ignore[arg-type]
    )

    async def run_twice() -> None:
        await cleanup()
        await cleanup()

    asyncio.run(run_twice())

    assert test_app.state.active_optimizations == 0
    assert optimizer.pn_model.close_calls == [False]  # type: ignore[attr-defined]


def test_background_cleanup_covers_a_stream_that_never_starts(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An aborted response may never pull the body, skipping generator finallys."""
    optimizer = _optimizer_with_recording_model()
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    async def abandon_response() -> None:
        test_app = optimization_api.app
        test_app.state.statuses = optimization_api.StatusStore()
        test_app.state.optimization_admission_lock = asyncio.Lock()
        test_app.state.active_optimizations = 0
        scope = {
            "type": "http",
            "app": test_app,
            "method": "POST",
            "path": "/optimize/all",
            "headers": [],
            "query_string": b"",
        }
        request = optimization_api.Request(scope)
        response = await optimization_api.post_optimize_all(
            request, optimization_manifest
        )

        assert test_app.state.active_optimizations == 1
        assert response.background is not None
        # The client is gone before the body iterator is ever started; only
        # the background task remains to release the slot and the CLI.
        await response.background()
        assert test_app.state.active_optimizations == 0

    asyncio.run(abandon_response())

    assert optimizer.pn_model.close_calls == [False]  # type: ignore[attr-defined]


def test_cancellation_during_initialization_closes_cli_and_releases_slot(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_app = FastAPI()
    test_app.state.optimization_admission_lock = asyncio.Lock()
    test_app.state.active_optimizations = 1
    started = threading.Event()
    finish = threading.Event()

    class ClosableModel:
        closed = False

        def close(self, *, graceful: bool = True) -> None:
            assert graceful is False
            self.closed = True

    optimizer = FakeOptimizer()
    optimizer.pn_model = ClosableModel()  # type: ignore[attr-defined]

    def initialize(_manifest: dict[str, Any], **_kwargs: Any) -> FakeOptimizer:
        started.set()
        finish.wait(timeout=1)
        return optimizer

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    async def cancel_initialization() -> None:
        task = asyncio.create_task(
            optimization_api._initialize_admitted_optimizer(
                test_app, optimization_manifest
            )
        )
        await asyncio.to_thread(started.wait, 1)
        task.cancel()
        finish.set()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(cancel_initialization())

    assert optimizer.pn_model.closed is True  # type: ignore[attr-defined]
    assert test_app.state.active_optimizations == 0


def test_second_cancellation_still_closes_an_abandoned_cli(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A cancel racing the init-cancel recovery must not orphan the CLI."""
    test_app = _admitted_test_app(active_optimizations=1)
    optimizer = _optimizer_with_recording_model()
    started = threading.Event()
    finish = threading.Event()

    def initialize(_manifest: dict[str, Any], **_kwargs: Any) -> FakeOptimizer:
        started.set()
        finish.wait(timeout=2)
        return optimizer

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    async def cancel_twice() -> None:
        task = asyncio.create_task(
            optimization_api._initialize_admitted_optimizer(
                test_app, optimization_manifest
            )
        )
        await asyncio.to_thread(started.wait, 1)
        task.cancel()
        # Let the task enter its recovery await before cancelling again.
        await asyncio.sleep(0.05)
        task.cancel()
        finish.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        # The abandoned CLI is closed by the initializer's done-callback,
        # which hands off to a daemon thread.
        for _ in range(100):
            if optimizer.pn_model.close_calls:  # type: ignore[attr-defined]
                return
            await asyncio.sleep(0.01)

    asyncio.run(cancel_twice())

    assert optimizer.pn_model.close_calls == [False]  # type: ignore[attr-defined]
    assert test_app.state.active_optimizations == 0


def test_openapi_exposes_post_sse_paths_with_an_untyped_json_body() -> None:
    schema = optimization_api.app.openapi()

    for path in ("/optimize/all", "/optimize/best"):
        operation = schema["paths"][path]
        assert "post" in operation
        assert "get" not in operation
        request_schema = operation["post"]["requestBody"]["content"][
            "application/json"
        ]["schema"]
        assert request_schema["type"] == "object"
        stream_schema = operation["post"]["responses"]["200"]["content"][
            "text/event-stream"
        ]["schema"]
        assert stream_schema["type"] == "string"


class ScriptedDetachedOptimizer:
    """Pump-driven double for detached-run endpoint tests.

    Emits one data frame, optionally holds (releasable from the test thread,
    cancellable through the run), then finishes with a second data frame and
    the done frame — mirroring the real engine's frame bodies.
    """

    n_trials = 2

    def __init__(self, *, hold: bool = False) -> None:
        self.pn_model = RecordingModel()
        self.hold = hold
        self.release = threading.Event()

    async def pump_events(
        self,
        _app: Any,
        _run_id: str,
        _n_trials: int,
        *,
        on_event: Callable[[str], Any],
        cancel_event: asyncio.Event,
        correlation: Any = None,
    ) -> str:
        on_event(
            'data: {"step": 0, "params": {"rate": 1.0}, '
            '"init_state": {}, "metric": 2.0, "state": "COMPLETE"}\n\n'
        )
        while self.hold and not self.release.is_set():
            if cancel_event.is_set():
                self.pn_model.close(graceful=False)
                return "cancelled"
            await asyncio.sleep(0.005)
        on_event(
            'data: {"step": 1, "params": {"rate": 1.5}, '
            '"init_state": {}, "metric": 3.0, "state": "COMPLETE"}\n\n'
        )
        on_event("event: done\ndata: {}\n\n")
        self.pn_model.close(graceful=True)
        return "completed"


def _wait_until(predicate: Callable[[], bool], timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("condition not met within the timeout")


def _event_ids(text: str) -> list[int]:
    return [
        int(line.removeprefix("id: "))
        for line in text.splitlines()
        if line.startswith("id: ")
    ]


class _AttachedConsumerRequest:
    """Request double for direct attachment calls; connected until closed."""

    def __init__(self, app: FastAPI) -> None:
        self.app = app
        self.headers: dict[str, str] = {}

    async def is_disconnected(self) -> bool:
        return False


async def _start_detached_run(
    optimization_manifest: dict,
    *,
    detach_grace_seconds: float = 300,
) -> tuple[FastAPI, str]:
    """Create a detached run through the real endpoint, direct-call style.

    The TestClient transport buffers whole response bodies, so tests that
    must read a live SSE attachment incrementally call the endpoints
    directly and drive ``body_iterator`` themselves.
    """
    test_app = optimization_api.app
    test_app.state.statuses = optimization_api.StatusStore()
    test_app.state.optimization_admission_lock = asyncio.Lock()
    test_app.state.active_optimizations = 0
    test_app.state.optimization_runs = optimization_runs.OptimizationRunRegistry(
        detach_grace_seconds=detach_grace_seconds
    )
    scope = {
        "type": "http",
        "app": test_app,
        "method": "POST",
        "path": "/optimize/runs",
        "headers": [],
        "query_string": b"",
    }
    request = optimization_api.Request(scope)
    payload = await optimization_api.post_optimize_runs(
        request, optimization_manifest, optimization_api.Response()
    )
    return test_app, payload["run_id"]


async def _attach(test_app: FastAPI, run_id: str, cursor: int | None = None) -> Any:
    response = await optimization_api.get_optimize_run_events(
        run_id,
        _AttachedConsumerRequest(test_app),  # type: ignore[arg-type]
        cursor=cursor,
    )
    return response.body_iterator


def _frame_ids(frames: list[str]) -> list[int]:
    return [
        int(frame.split("\n", 1)[0].removeprefix("id: "))
        for frame in frames
        if frame.startswith("id: ")
    ]


def test_create_detached_run_returns_201_and_holds_the_slot_until_terminal(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize/runs", json=optimization_manifest)
        assert response.status_code == 201
        run_id = response.json()["run_id"]
        assert response.headers["x-optimization-run-id"] == run_id
        # No consumer is attached, yet the slot stays held by the run.
        assert optimization_api.app.state.active_optimizations == 1
        run = optimization_api.app.state.optimization_runs.get(run_id)
        assert run is not None
        assert run.state is RunState.running

        optimizer.release.set()
        _wait_until(
            lambda: optimization_api.app.state.active_optimizations == 0
        )
        _wait_until(lambda: run.state is RunState.completed)
        # The pump closed the CLI gracefully; the idempotent run cleanup adds
        # its prompt close, which the real adapter treats as a no-op.
        assert optimizer.pn_model.close_calls == [True, False]


def test_attach_replays_buffered_events_then_tails_live_ones(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    async def scenario() -> list[str]:
        test_app, run_id = await _start_detached_run(optimization_manifest)
        registry = test_app.state.optimization_runs
        try:
            response = await optimization_api.get_optimize_run_events(
                run_id,
                _AttachedConsumerRequest(test_app),  # type: ignore[arg-type]
                cursor=None,
            )
            assert response.headers["x-optimization-run-id"] == run_id
            assert response.media_type == "text/event-stream"
            stream = response.body_iterator
            frames = [await anext(stream)]
            # The buffered first trial replays before any live event.
            assert frames[0].startswith("id: 1\n")
            optimizer.release.set()
            async for frame in stream:
                frames.append(frame)
            run = registry.get(run_id)
            assert run is not None
            assert run.state is RunState.completed
            assert test_app.state.active_optimizations == 0
            return frames
        finally:
            await registry.shutdown()

    frames = asyncio.run(scenario())

    assert _frame_ids(frames) == [1, 2, 3]
    assert frames[-1] == "id: 3\nevent: done\ndata: {}\n\n"


def test_cursor_reattach_skips_already_seen_events(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer()
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    with TestClient(optimization_api.app) as client:
        run_id = client.post("/optimize/runs", json=optimization_manifest).json()[
            "run_id"
        ]
        run = optimization_api.app.state.optimization_runs.get(run_id)
        assert run is not None
        _wait_until(lambda: run.state is RunState.completed)

        from_cursor = client.get(f"/optimize/runs/{run_id}/events?cursor=1")
        from_header = client.get(
            f"/optimize/runs/{run_id}/events", headers={"Last-Event-ID": "2"}
        )
        cursor_wins = client.get(
            f"/optimize/runs/{run_id}/events?cursor=0",
            headers={"Last-Event-ID": "2"},
        )

    assert _event_ids(from_cursor.text) == [2, 3]
    assert _event_ids(from_header.text) == [3]
    assert _event_ids(cursor_wins.text) == [1, 2, 3]
    assert cursor_wins.text.endswith("id: 3\nevent: done\ndata: {}\n\n")


def test_detaching_a_consumer_does_not_cancel_the_run(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    async def scenario() -> list[str]:
        test_app, run_id = await _start_detached_run(optimization_manifest)
        registry = test_app.state.optimization_runs
        try:
            run = registry.get(run_id)
            assert run is not None
            stream = await _attach(test_app, run_id)
            assert (await anext(stream)).startswith("id: 1\n")
            # The consumer drops mid-run; the run must keep its slot and
            # keep optimizing.
            await stream.aclose()
            assert run.attached is False
            assert run.state is RunState.running
            assert test_app.state.active_optimizations == 1

            optimizer.release.set()
            await asyncio.wait_for(run.finished.wait(), 2)
            assert run.state is RunState.completed
            assert test_app.state.active_optimizations == 0

            # A later attachment replays the full log, then closes.
            replay = await _attach(test_app, run_id)
            return [frame async for frame in replay]
        finally:
            await registry.shutdown()

    frames = asyncio.run(scenario())

    assert _frame_ids(frames) == [1, 2, 3]
    assert frames[-1] == "id: 3\nevent: done\ndata: {}\n\n"


def test_a_second_attachment_supersedes_the_first(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    async def scenario() -> None:
        test_app, run_id = await _start_detached_run(optimization_manifest)
        registry = test_app.state.optimization_runs
        try:
            first = await _attach(test_app, run_id)
            first_frame = await anext(first)
            assert first_frame.startswith("id: 1\n")

            second = await _attach(test_app, run_id)
            # The superseded first stream ends without a terminal frame.
            with pytest.raises(StopAsyncIteration):
                await anext(first)
            run = registry.get(run_id)
            assert run is not None
            assert run.attached is True

            assert await anext(second) == first_frame
            optimizer.release.set()
            remaining = [frame async for frame in second]
            assert _frame_ids(remaining) == [2, 3]
        finally:
            await registry.shutdown()

    asyncio.run(scenario())


def test_delete_cancels_a_detached_run_and_is_idempotent(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    with TestClient(optimization_api.app) as client:
        run_id = client.post("/optimize/runs", json=optimization_manifest).json()[
            "run_id"
        ]
        assert optimization_api.app.state.active_optimizations == 1

        response = client.delete(f"/optimize/runs/{run_id}")
        assert response.status_code == 204
        run = optimization_api.app.state.optimization_runs.get(run_id)
        assert run is not None
        assert run.state is RunState.cancelled
        assert run.events[-1] == (2, CANCELLED_FRAME)
        # The pump closed the CLI promptly and the cleanup added its
        # idempotent prompt close; neither waited for a graceful EOF.
        assert optimizer.pn_model.close_calls == [False, False]
        assert optimization_api.app.state.active_optimizations == 0

        second = client.delete(f"/optimize/runs/{run_id}")
        assert second.status_code == 204
        assert optimization_api.app.state.active_optimizations == 0
        assert optimizer.pn_model.close_calls == [False, False]

        replay = client.get(f"/optimize/runs/{run_id}/events")

    assert _event_ids(replay.text) == [1, 2]
    assert replay.text.endswith(f"id: 2\n{CANCELLED_FRAME}")


def test_the_reaper_cancels_a_run_nobody_attached_to(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv(
        optimization_runs.DETACH_GRACE_ENVIRONMENT_VARIABLE, "0.05"
    )
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    with caplog.at_level(logging.WARNING, logger="pn_runs"):
        with TestClient(optimization_api.app) as client:
            run_id = client.post(
                "/optimize/runs", json=optimization_manifest
            ).json()["run_id"]
            run = optimization_api.app.state.optimization_runs.get(run_id)
            assert run is not None
            _wait_until(lambda: run.state is RunState.cancelled)
            _wait_until(
                lambda: optimization_api.app.state.active_optimizations == 0
            )
            assert run.events[-1] == (2, CANCELLED_FRAME)

    reaped = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "run_reaped"
    )
    assert reaped.run_id == run_id


def test_the_reaper_spares_a_run_with_an_attached_consumer(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    optimizer = ScriptedDetachedOptimizer(hold=True)
    monkeypatch.setattr(
        optimization_api, "initialize_optimizer", lambda _manifest, **_kwargs: optimizer
    )

    async def scenario() -> None:
        test_app, run_id = await _start_detached_run(
            optimization_manifest, detach_grace_seconds=0.05
        )
        registry = test_app.state.optimization_runs
        try:
            run = registry.get(run_id)
            assert run is not None
            stream = await _attach(test_app, run_id)
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
            await registry.shutdown()

    asyncio.run(scenario())


def test_unknown_detached_runs_return_404() -> None:
    with TestClient(optimization_api.app) as client:
        assert client.get("/optimize/runs/missing/events").status_code == 404
        assert client.delete("/optimize/runs/missing").status_code == 404


def test_create_detached_run_preserves_the_capacity_rejection(
    optimization_manifest: dict,
) -> None:
    with TestClient(optimization_api.app) as client:
        optimization_api.app.state.active_optimizations = (
            optimization_api.MAX_ACTIVE_OPTIMIZATIONS
        )
        response = client.post("/optimize/runs", json=optimization_manifest)

    assert response.status_code == 429
    assert response.headers["retry-after"] == str(optimization_api.RETRY_AFTER_SECONDS)


def test_create_detached_run_rejects_an_oversized_manifest(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(optimization_api, "MAX_REQUEST_BODY_BYTES", 8)

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize/runs", content=b'{"long":true}')

    assert response.status_code == 413


def test_create_detached_run_reports_initialization_failure_with_the_run_id(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def initialize(_manifest: dict[str, Any], **_kwargs: Any) -> Any:
        raise RuntimeError("manifest rejected by CLI")

    monkeypatch.setattr(optimization_api, "initialize_optimizer", initialize)

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize/runs", json=optimization_manifest)
        run_id = response.headers["x-optimization-run-id"]
        assert optimization_api.app.state.active_optimizations == 0
        assert optimization_api.app.state.optimization_runs.get(run_id) is None

    assert response.status_code == 500
    assert "manifest rejected by CLI" in response.json()["detail"]


def test_openapi_exposes_the_detached_run_paths() -> None:
    schema = optimization_api.app.openapi()

    create = schema["paths"]["/optimize/runs"]["post"]
    request_schema = create["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["type"] == "object"
    assert "201" in create["responses"]
    assert "Retry-After" in create["responses"]["429"]["headers"]
    assert "413" in create["responses"]
    assert "500" in create["responses"]

    events = schema["paths"]["/optimize/runs/{run_id}/events"]["get"]
    stream_schema = events["responses"]["200"]["content"]["text/event-stream"][
        "schema"
    ]
    assert stream_schema["type"] == "string"
    assert "event: cancelled" in events["responses"]["200"]["description"]
    assert "404" in events["responses"]

    run_path = schema["paths"]["/optimize/runs/{run_id}"]
    assert set(run_path) == {"delete"}
    assert "204" in run_path["delete"]["responses"]
    assert "404" in run_path["delete"]["responses"]
