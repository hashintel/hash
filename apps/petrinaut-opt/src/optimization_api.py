#!/usr/bin/env python3
"""HTTP API for streaming Petrinaut optimization studies.

@layerRoot optimizer
@role FastAPI service running detached Optuna studies through the Petrinaut Python bindings, with replayable event streams and admission control.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.trace import SpanKind, Status, StatusCode
from petrinaut import OptimizationSession
from pydantic import BaseModel
from starlette.background import BackgroundTask
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.optimization_runs import OptimizationRunRegistry, attachment_event_stream
from src.petrinaut_optimizer import PetrinautOptimizer
from src.telemetry import flush_telemetry, setup_telemetry
from src.utils import Phase, RunStatus, StatusStore, set_status

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
load_dotenv(REPO_ROOT / ".env")
log = logging.getLogger("pn_api")
tracer = trace.get_tracer("pn_api")
MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024
MAX_ACTIVE_OPTIMIZATIONS = 4
RETRY_AFTER_SECONDS = 30
_OPTIMIZATION_PATHS = {"/optimize/runs"}
_CREATE_RUN_RESPONSES: dict[int | str, dict[str, Any]] = {
    201: {"description": "A detached optimization run was started"},
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
    500: {"description": "The session or optimization study could not initialize"},
}
_RUN_EVENTS_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": (
            "Server-Sent Events attachment to a detached optimization run. "
            "Every frame carries an `id: <seq>` line (seq starts at 1); "
            "buffered frames with seq > cursor are replayed, then new frames "
            "are live-tailed with `: heartbeat` comments roughly every 30 "
            "seconds. The terminal frame is `event: done` (completed), an "
            "ERROR data frame (study failure), or `event: cancelled` "
            "(cancelled or reaped). If the run is already terminal the "
            "response closes after the replay. Disconnecting does not affect "
            "the run; a newer attachment supersedes this one."
        ),
        "content": {"text/event-stream": {"schema": {"type": "string"}}},
        "headers": {
            "X-Requested-Trials": {
                "description": (
                    "Trial count requested by the run's manifest, for "
                    "sizing synthesized summaries"
                ),
                "schema": {"type": "string"},
            },
        },
    },
    404: {"description": "No optimization run with this id is registered"},
}
_DELETE_RUN_RESPONSES: dict[int | str, dict[str, Any]] = {
    204: {
        "description": (
            "The run was cancelled (or had already reached a terminal "
            "state); when this call stopped it, the event log's terminal "
            "frame is `event: cancelled`"
        ),
    },
    404: {"description": "No optimization run with this id is registered"},
}


class OptimizationRunCreated(BaseModel):
    """Response body of a successful detached-run creation."""

    run_id: str


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
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Initialize the status registry and detached-run engine."""
    app.state.statuses = StatusStore()
    app.state.optimization_admission_lock = asyncio.Lock()
    app.state.active_optimizations = 0
    app.state.optimization_pending_accounts = set()
    app.state.optimization_runs = OptimizationRunRegistry()
    try:
        yield
    finally:
        try:
            await app.state.optimization_runs.shutdown()
        finally:
            # Flush buffered spans/metrics/logs on graceful shutdown so a SIGTERM
            # (e.g. `docker stop`) does not drop whatever the batch processors have
            # queued.
            flush_telemetry()


app = FastAPI(title="Petrinaut optimization Python API", lifespan=lifespan)
app.add_middleware(RequestBodyLimitMiddleware)
setup_telemetry(app)


def initialize_optimizer(
    optimization_manifest: dict[str, Any],
) -> PetrinautOptimizer:
    """Start Petrinaut and build an Optuna study from its description."""
    model = OptimizationSession(optimization_manifest)
    try:
        model.start()
        return PetrinautOptimizer(model)
    except Exception:
        # A failure path, so signal rather than wait out the graceful EOF while
        # still holding the admission slot.
        model.close(graceful=False)
        raise


async def _acquire_optimization_slot(
    app: FastAPI,
    *,
    request_id: str | None = None,
    account_id: str | None = None,
) -> None:
    async with app.state.optimization_admission_lock:
        # One account drives at most one optimization at a time. Pending
        # creations are tracked separately because the run only appears in
        # the registry once its session has initialized.
        if account_id is not None and (
            account_id in app.state.optimization_pending_accounts
            or app.state.optimization_runs.has_live_run_for_account(account_id)
        ):
            log.warning(
                "optimization request rejected: account busy",
                extra={
                    "event": "account_busy_rejected",
                    "request_id": request_id,
                },
            )
            raise HTTPException(
                status_code=429,
                detail="An optimization is already running for this account",
            )
        if app.state.active_optimizations >= MAX_ACTIVE_OPTIMIZATIONS:
            log.warning(
                "optimization request rejected: study limit reached",
                extra={
                    "event": "capacity_rejected",
                    "active_optimizations": app.state.active_optimizations,
                    "max_active_optimizations": MAX_ACTIVE_OPTIMIZATIONS,
                    "request_id": request_id,
                },
            )
            raise HTTPException(
                status_code=429,
                detail=(
                    "The optimizer is already running its maximum number of studies"
                ),
                headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
            )
        app.state.active_optimizations += 1
        if account_id is not None:
            app.state.optimization_pending_accounts.add(account_id)


def _request_correlation(request: Request) -> dict[str, str | None]:
    return {"request_id": request.headers.get("x-hash-request-id")}


def _account_id(request: Request) -> str | None:
    """The opaque owner tag stamped by the authenticated proxy, if any.

    Direct callers (local development, the website demo) send none: their
    runs are created ownerless and stay attachable without the header.
    """
    value = (request.headers.get("x-hash-account-id") or "").strip()
    return value or None


def _discard_pending_account(app: FastAPI, account_id: str | None) -> None:
    if account_id is not None:
        app.state.optimization_pending_accounts.discard(account_id)


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
        # the initializer finishes, close whatever session it started even if no
        # coroutine is left awaiting it. close() is idempotent, so the
        # awaited recovery close and this callback can coexist.
        def _close_abandoned_optimizer(task: asyncio.Task[PetrinautOptimizer]) -> None:
            if task.cancelled() or task.exception() is not None:
                return
            threading.Thread(
                target=task.result().pn_model.close,
                kwargs={"graceful": False},
                daemon=True,
                name="petrinaut-abandoned-session-close",
            ).start()

        initializer.add_done_callback(_close_abandoned_optimizer)
        optimizer: PetrinautOptimizer | None = None
        try:
            with suppress(Exception, asyncio.CancelledError):
                optimizer = await asyncio.shield(initializer)
            if optimizer is not None:
                with suppress(Exception):
                    await asyncio.to_thread(optimizer.pn_model.close, graceful=False)
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
    admission slot and a live session.
    """
    cleaned_up = False

    async def cleanup() -> None:
        nonlocal cleaned_up
        if cleaned_up:
            return
        cleaned_up = True
        try:
            # No-op when the stream already closed the session; prompt when the
            # stream generators never ran at all.
            with suppress(Exception):
                await asyncio.to_thread(optimizer.pn_model.close, graceful=False)
        finally:
            await _release_optimization_slot(app)

    return cleanup


def _initialization_error(
    app: FastAPI,
    run_id: str,
    error: Exception,
    *,
    request_id: str | None = None,
) -> HTTPException:
    set_status(
        app,
        run_id,
        phase=Phase.error,
        detail="Petrinaut session and Optimization Model could NOT be initialized",
    )
    # The error string can embed the backend's first diagnostic line, which may quote a
    # user identifier or expression error, so log a stable classification only.
    # The full message still goes back to the requester in the 500 detail.
    log.error(
        "optimization initialization failed",
        extra={
            "event": "initialization_failed",
            "run_id": run_id,
            "error_type": type(error).__name__,
            "request_id": request_id,
        },
    )
    return HTTPException(
        500,
        f"failed to initialise optimization: {error}",
        headers={"X-Optimization-Run-ID": run_id},
    )


async def _admit_and_initialize_run(
    request: Request,
    optimization_manifest: dict[str, Any],
    *,
    account_id: str | None = None,
) -> tuple[str, PetrinautOptimizer, dict[str, str | None]]:
    """Admit and initialize one optimizer, releasing its slot on failure.

    The caller owns clearing the account's pending-creation mark (in a
    ``finally`` around the whole creation flow), so every failure path here
    only needs to release the slot itself.
    """
    correlation = _request_correlation(request)
    await _acquire_optimization_slot(
        request.app,
        request_id=correlation["request_id"],
        account_id=account_id,
    )
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
            detail="Petrinaut session and Optimization Model initialized",
        )
    except Exception as error:
        if optimizer is not None:
            with suppress(Exception):
                await asyncio.to_thread(optimizer.pn_model.close, graceful=False)
        await asyncio.shield(_release_optimization_slot(request.app))
        raise _initialization_error(
            request.app, run_id, error, request_id=correlation["request_id"]
        ) from error
    return run_id, optimizer, correlation


@app.post("/optimize/runs", status_code=201, responses=_CREATE_RUN_RESPONSES)
async def post_optimize_runs(
    request: Request,
    optimization_manifest: dict[str, Any],
    response: Response,
) -> OptimizationRunCreated:
    """Start a detached run that remains available for later SSE attachment.

    When the caller stamps ``x-hash-account-id`` (the authenticated proxy
    does), the run is owned: the account is single-flight while it lives, and
    only requests carrying the same tag may attach to or cancel it.
    """
    account_id = _account_id(request)
    try:
        run_id, optimizer, correlation = await _admit_and_initialize_run(
            request, optimization_manifest, account_id=account_id
        )
        cleanup = _create_admitted_run_cleanup(request.app, optimizer)
        request.app.state.optimization_runs.create_run(
            request.app,
            run_id=run_id,
            optimizer=optimizer,
            cleanup=cleanup,
            correlation=correlation,
            account_id=account_id,
        )
    finally:
        # The registry entry (or the failure) now carries the truth; the
        # pending-creation mark has done its job on every path, including
        # cancellation mid-initialization.
        _discard_pending_account(request.app, account_id)
    response.headers["X-Optimization-Run-ID"] = run_id
    return OptimizationRunCreated(run_id=run_id)


def _resolve_owned_run(request: Request, run_id: str) -> Any:
    """Look up a run, enforcing its owner tag when it has one.

    Answers 404 for a mismatch — identical to an unknown run, so id-guessing
    callers cannot learn that a foreign run exists.
    """
    run = request.app.state.optimization_runs.get(run_id)
    if run is None or (
        run.account_id is not None and _account_id(request) != run.account_id
    ):
        raise HTTPException(404, f"optimization run not found: {run_id}")
    return run


def _cursor_from_last_event_id(request: Request) -> int:
    raw = request.headers.get("last-event-id")
    if raw is None:
        return 0
    try:
        return max(0, int(raw.strip()))
    except ValueError:
        return 0


@app.get(
    "/optimize/runs/{run_id}/events",
    response_class=StreamingResponse,
    responses=_RUN_EVENTS_RESPONSES,
)
async def get_optimize_run_events(
    run_id: str,
    request: Request,
    cursor: int | None = Query(default=None, ge=0),
) -> StreamingResponse:
    """Attach to a detached run and replay events after the supplied cursor.

    The route is excluded from ASGI auto-instrumentation (see
    ``telemetry.py``): its response live-tails until the consumer detaches,
    and a SERVER span that long would read as worst-case latency in the RED
    SLIs and only export on disconnect. A short manual SERVER span covers
    just the attach itself — run lookup, cursor resolution, and attachment
    registration — and ends when the tail starts, so the latency SLI
    measures "was attaching fast" while the client→optimizer service-graph
    edge is preserved.
    """
    with tracer.start_as_current_span(
        "GET /optimize/runs/{run_id}/events",
        context=extract(dict(request.headers)),
        kind=SpanKind.SERVER,
        attributes={
            "http.method": "GET",
            "http.route": "/optimize/runs/{run_id}/events",
            "http.target": f"/optimize/runs/{run_id}/events",
        },
        # Status and attributes are set explicitly below; an expected 404
        # must not surface as a recorded exception on the span.
        record_exception=False,
        set_status_on_exception=False,
        end_on_exit=True,
    ) as attach_span:
        try:
            run = _resolve_owned_run(request, run_id)
        except HTTPException:
            attach_span.set_attribute("http.status_code", 404)
            attach_span.set_status(Status(StatusCode.ERROR))
            raise
        if cursor is None:
            cursor = _cursor_from_last_event_id(request)
        epoch = run.begin_attachment()
        attach_span.set_attribute("http.status_code", 200)

    async def detach_if_never_started() -> None:
        # A consumer that aborts before the body iterator ever starts would
        # otherwise stay marked attached and shield the run from the reaper.
        # This must be async: Starlette runs sync background callables in a
        # threadpool, where end_attachment's get_running_loop() would fail.
        run.end_attachment(epoch)

    return StreamingResponse(
        attachment_event_stream(
            run,
            cursor=cursor,
            epoch=epoch,
            request=request,
            correlation=_request_correlation(request),
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Optimization-Run-ID": run_id,
            # Sizes the consumer's synthesized summary without the proxy
            # having to remember the manifest.
            "X-Requested-Trials": str(run.requested_trials),
        },
        background=BackgroundTask(detach_if_never_started),
    )


@app.delete("/optimize/runs/{run_id}", status_code=204, responses=_DELETE_RUN_RESPONSES)
async def delete_optimize_run(run_id: str, request: Request) -> Response:
    """Cancel a detached run and wait for its resources to be released."""
    run = _resolve_owned_run(request, run_id)
    if run.request_cancel("cancelled by client request"):
        log.info(
            "optimization run cancellation requested",
            extra={
                "event": "run_cancel_requested",
                "run_id": run_id,
                **_request_correlation(request),
            },
        )
    await run.finished.wait()
    return Response(status_code=204)


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


@app.get("/health")
async def health() -> Response:
    """Report liveness, without checking any dependency.

    A probe that reaches through to a dependency takes every task out of
    rotation as soon as that dependency is slow.
    """
    return Response(
        content='{"status":"pass"}',
        media_type="application/health+json",
    )


@app.get("/")
async def root() -> dict[str, str]:
    """Return a welcome message for the API root."""
    return {"message": "Welcome to Petrinaut optimization API"}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HASH_PETRINAUT_OPT_HOST", "localhost")
    port = int(os.getenv("HASH_PETRINAUT_OPT_PORT", "4004"))
    uvicorn.run(app, host=host, port=port)
