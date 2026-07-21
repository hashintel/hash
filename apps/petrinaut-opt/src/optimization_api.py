#!/usr/bin/env python3
"""HTTP API for streaming Petrinaut optimization studies."""

from __future__ import annotations

import asyncio
import os
import threading
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.petrinaut_client import PetrinautModel
from src.petrinaut_optimizer import PetrinautOptimizer
from src.utils import Phase, RunStatus, StatusStore, set_status


REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
load_dotenv(REPO_ROOT / ".env")
MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024
MAX_ACTIVE_OPTIMIZATIONS = 4
RETRY_AFTER_SECONDS = 30
_OPTIMIZATION_PATHS = {"/optimize/all", "/optimize/best"}
_SSE_RESPONSES = {
    200: {
        "description": "Server-Sent Events optimization stream",
        "content": {"text/event-stream": {"schema": {"type": "string"}}},
    },
    413: {"description": "The optimization manifest exceeds 8 MiB"},
    429: {
        "description": "The service is already at its study limit",
        "headers": {
            "Retry-After": {
                "description": "Seconds to wait before retrying the study",
                "schema": {"type": "string"},
            },
        },
    },
    500: {"description": "The CLI or optimization study could not initialize"},
}


class _RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    """Reject oversized optimization manifests, including chunked bodies."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or scope["path"] not in _OPTIMIZATION_PATHS
        ):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_REQUEST_BODY_BYTES:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                pass

        received_bytes = 0

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > MAX_REQUEST_BODY_BYTES:
                    raise _RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLarge:
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": "Request body exceeds the 8 MiB limit"},
        )
        await response(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize the run-scoped status registry."""
    app.state.statuses = StatusStore()
    app.state.optimization_admission_lock = asyncio.Lock()
    app.state.active_optimizations = 0
    yield


app = FastAPI(title="Petrinaut optimization Python API", lifespan=lifespan)
app.add_middleware(RequestBodyLimitMiddleware)


def create_model(optimization_manifest: dict[str, Any]) -> PetrinautModel:
    """Create the CLI adapter; retained as a narrow seam for API tests."""
    return PetrinautModel(optimization_manifest)


def initialize_optimizer(
    optimization_manifest: dict[str, Any],
) -> PetrinautOptimizer:
    """Start Petrinaut and build an Optuna study from its description."""
    model = create_model(optimization_manifest)
    try:
        model.start()
        return PetrinautOptimizer(model)
    except Exception:
        model.close()
        raise


async def _acquire_optimization_slot(app: FastAPI) -> None:
    async with app.state.optimization_admission_lock:
        if app.state.active_optimizations >= MAX_ACTIVE_OPTIMIZATIONS:
            raise HTTPException(
                status_code=429,
                detail=(
                    "The optimizer is already running its maximum number of studies"
                ),
                headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
            )
        app.state.active_optimizations += 1


async def _release_optimization_slot(app: FastAPI) -> None:
    async with app.state.optimization_admission_lock:
        app.state.active_optimizations -= 1


async def _initialize_admitted_optimizer(
    app: FastAPI, optimization_manifest: dict[str, Any]
) -> PetrinautOptimizer:
    """Initialize off-loop and clean up if the request task is cancelled."""
    initializer = asyncio.create_task(
        asyncio.to_thread(initialize_optimizer, optimization_manifest)
    )
    try:
        return await asyncio.shield(initializer)
    except asyncio.CancelledError:
        # Backstop for a second cancellation racing the recovery below: once
        # the initializer finishes, close whatever CLI it started even if no
        # coroutine is left awaiting it. close() is idempotent, so the
        # awaited recovery close and this callback can coexist.
        def _close_abandoned_optimizer(task: asyncio.Task[PetrinautOptimizer]) -> None:
            if task.cancelled() or task.exception() is not None:
                return
            threading.Thread(
                target=task.result().pn_model.close,
                kwargs={"graceful": False},
                daemon=True,
                name="petrinaut-abandoned-cli-close",
            ).start()

        initializer.add_done_callback(_close_abandoned_optimizer)
        optimizer: PetrinautOptimizer | None = None
        try:
            with suppress(Exception, asyncio.CancelledError):
                optimizer = await asyncio.shield(initializer)
            if optimizer is not None:
                with suppress(Exception):
                    await asyncio.to_thread(
                        optimizer.pn_model.close, graceful=False
                    )
        finally:
            await asyncio.shield(_release_optimization_slot(app))
        raise


def _create_admitted_run_cleanup(
    app: FastAPI, optimizer: PetrinautOptimizer
) -> Callable[[], Awaitable[None]]:
    """Build the idempotent teardown for one admitted optimization run.

    The teardown runs from the stream wrapper's ``finally`` on every consumed
    stream, and again as the response's background task: when a client aborts
    before the response body is ever pulled, the never-started generators skip
    their ``finally`` blocks entirely, which would otherwise leak both the
    admission slot and a live CLI process.
    """
    cleaned_up = False

    async def cleanup() -> None:
        nonlocal cleaned_up
        if cleaned_up:
            return
        cleaned_up = True
        try:
            # No-op when the stream already closed the CLI; prompt when the
            # stream generators never ran at all.
            with suppress(Exception):
                await asyncio.to_thread(optimizer.pn_model.close, graceful=False)
        finally:
            await _release_optimization_slot(app)

    return cleanup


async def _stream_with_cleanup(
    stream: AsyncIterator[str], cleanup: Callable[[], Awaitable[None]]
) -> AsyncIterator[str]:
    try:
        async for frame in stream:
            yield frame
    finally:
        await asyncio.shield(cleanup())


def _initialization_error(app: FastAPI, run_id: str, error: Exception) -> HTTPException:
    set_status(
        app,
        run_id,
        phase=Phase.error,
        detail="Petrinaut CLI and Optimization Model could NOT be initialized",
    )
    return HTTPException(
        500,
        f"failed to initialise optimization: {error}",
        headers={"X-Optimization-Run-ID": run_id},
    )


@app.post(
    "/optimize/all",
    response_class=StreamingResponse,
    responses=_SSE_RESPONSES,
)
async def post_optimize_all(
    request: Request,
    optimization_manifest: dict[str, Any],
) -> StreamingResponse:
    """Stream one SSE data frame for every completed Optuna trial."""
    await _acquire_optimization_slot(request.app)
    try:
        run_id = request.app.state.statuses.create().run_id
    except BaseException:
        await asyncio.shield(_release_optimization_slot(request.app))
        raise
    optimizer: PetrinautOptimizer | None = None
    try:
        optimizer = await _initialize_admitted_optimizer(
            request.app, optimization_manifest
        )
        set_status(
            request.app,
            run_id,
            phase=Phase.running,
            detail="Petrinaut CLI and Optimization Model initialized",
        )
    except Exception as error:
        if optimizer is not None:
            with suppress(Exception):
                await asyncio.to_thread(optimizer.pn_model.close, graceful=False)
        await asyncio.shield(_release_optimization_slot(request.app))
        raise _initialization_error(request.app, run_id, error) from error

    cleanup = _create_admitted_run_cleanup(request.app, optimizer)
    return StreamingResponse(
        _stream_with_cleanup(
            optimizer.stream_all(request, run_id=run_id, n_trials=optimizer.n_trials),
            cleanup,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Optimization-Run-ID": run_id,
        },
        background=BackgroundTask(cleanup),
    )


@app.post(
    "/optimize/best",
    response_class=StreamingResponse,
    responses=_SSE_RESPONSES,
)
async def post_optimize_best(
    request: Request,
    optimization_manifest: dict[str, Any],
) -> StreamingResponse:
    """Stream the best-so-far SSE data frame after every completed trial."""
    await _acquire_optimization_slot(request.app)
    try:
        run_id = request.app.state.statuses.create().run_id
    except BaseException:
        await asyncio.shield(_release_optimization_slot(request.app))
        raise
    optimizer: PetrinautOptimizer | None = None
    try:
        optimizer = await _initialize_admitted_optimizer(
            request.app, optimization_manifest
        )
        set_status(
            request.app,
            run_id,
            phase=Phase.running,
            detail="Petrinaut CLI and Optimization Model initialized",
        )
    except Exception as error:
        if optimizer is not None:
            with suppress(Exception):
                await asyncio.to_thread(optimizer.pn_model.close, graceful=False)
        await asyncio.shield(_release_optimization_slot(request.app))
        raise _initialization_error(request.app, run_id, error) from error

    cleanup = _create_admitted_run_cleanup(request.app, optimizer)
    return StreamingResponse(
        _stream_with_cleanup(
            optimizer.stream_best(request, run_id=run_id, n_trials=optimizer.n_trials),
            cleanup,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Optimization-Run-ID": run_id,
        },
        background=BackgroundTask(cleanup),
    )


@app.get("/status")
def get_status() -> list[RunStatus]:
    """Return a snapshot of every optimization run's status."""
    return app.state.statuses.all()


@app.get("/status/{run_id}")
def get_run_status(run_id: str) -> RunStatus:
    """Return the status of one optimization run."""
    status = app.state.statuses.get(run_id)
    if status is None:
        raise HTTPException(404, f"optimization run not found: {run_id}")
    return status


@app.get("/")
async def root() -> dict[str, str]:
    """Return a welcome message for the API root."""
    return {"message": "Welcome to Petrinaut optimization API"}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HASH_PETRINAUT_OPT_HOST", "localhost")
    port = int(os.getenv("HASH_PETRINAUT_OPT_PORT", "4004"))
    uvicorn.run(app, host=host, port=port)
