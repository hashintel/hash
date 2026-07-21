from __future__ import annotations

import asyncio
import threading
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src import optimization_api


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

    def initialize(manifest: dict[str, Any]) -> FakeOptimizer:
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

    def initialize(manifest: dict[str, Any]) -> FakeOptimizer:
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
    def initialize(_manifest: dict[str, Any]) -> FakeOptimizer:
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


def test_initializer_runs_off_the_event_loop(
    optimization_manifest: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    initializer_thread_ids: list[int] = []

    def initialize(_manifest: dict[str, Any]) -> FakeOptimizer:
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
        optimization_api, "initialize_optimizer", lambda _manifest: optimizer
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

    def initialize(_manifest: dict[str, Any]) -> FakeOptimizer:
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

    def initialize(_manifest: dict[str, Any]) -> FakeOptimizer:
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
