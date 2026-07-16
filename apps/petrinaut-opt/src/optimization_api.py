"""FastAPI service for streaming Petrinaut optimization studies."""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src.optimization_models import (
    OptimizationCompleteEvent,
    OptimizationErrorEvent,
    OptimizationEvent,
    OptimizationInput,
    OptimizationStartedEvent,
)
from src.petrinaut_client import PetrinautClient
from src.petrinaut_optimizer import PetrinautOptimizer
from src.utils import AppStatus, Phase, set_status


load_dotenv()

MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024
MAX_ACTIVE_OPTIMIZATIONS = 4
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 4004


class _RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    """Reject oversized optimization bodies, including chunked requests."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or scope["path"] != "/optimize"
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


class NDJSONStreamingResponse(StreamingResponse):
    media_type = "application/x-ndjson"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.status = AppStatus()
    app.state.optimization_admission_lock = asyncio.Lock()
    app.state.active_optimizations = 0
    yield


app = FastAPI(title="Petrinaut optimization Python API", lifespan=lifespan)
app.add_middleware(RequestBodyLimitMiddleware)

_OPTIMIZATION_EVENT_SCHEMA = {
    "oneOf": [
        {"$ref": "#/components/schemas/OptimizationStartedEvent"},
        {"$ref": "#/components/schemas/OptimizationTrialEvent"},
        {"$ref": "#/components/schemas/OptimizationCompleteEvent"},
        {"$ref": "#/components/schemas/OptimizationErrorEvent"},
    ],
    "discriminator": {
        "propertyName": "type",
        "mapping": {
            "started": "#/components/schemas/OptimizationStartedEvent",
            "trial": "#/components/schemas/OptimizationTrialEvent",
            "complete": "#/components/schemas/OptimizationCompleteEvent",
            "error": "#/components/schemas/OptimizationErrorEvent",
        },
    },
}


def create_client(optimization_input: OptimizationInput) -> PetrinautClient:
    """Create the internal CLI client; kept as a seam for focused tests."""
    return PetrinautClient(optimization_input.model)


async def stream_optimization(
    request: Request, optimization_input: OptimizationInput
) -> AsyncIterator[str]:
    optimizer = PetrinautOptimizer(
        optimization_input,
        create_client(optimization_input),
    )
    terminal_status_seen = False
    try:
        async for event in optimizer.stream(request):
            if isinstance(event, OptimizationStartedEvent):
                set_status(
                    request.app,
                    phase=Phase.running,
                    detail="optimization running",
                )
            elif isinstance(event, OptimizationCompleteEvent):
                terminal_status_seen = True
                set_status(
                    request.app,
                    phase=Phase.done,
                    detail="optimization completed",
                )
            elif isinstance(event, OptimizationErrorEvent):
                terminal_status_seen = True
                set_status(
                    request.app,
                    phase=Phase.error,
                    detail="optimization failed",
                )
            yield event.model_dump_json(by_alias=True) + "\n"
    finally:
        if not terminal_status_seen:
            set_status(
                request.app,
                phase=Phase.idle,
                detail="optimization client disconnected",
            )


async def _acquire_optimization_slot(app: FastAPI) -> None:
    async with app.state.optimization_admission_lock:
        if app.state.active_optimizations >= MAX_ACTIVE_OPTIMIZATIONS:
            raise HTTPException(
                status_code=429,
                detail="The optimizer is already running its maximum number of studies",
            )
        app.state.active_optimizations += 1


async def _stream_with_admission_slot(
    request: Request, optimization_input: OptimizationInput
) -> AsyncIterator[str]:
    try:
        async for line in stream_optimization(request, optimization_input):
            yield line
    finally:
        async with request.app.state.optimization_admission_lock:
            request.app.state.active_optimizations -= 1


@app.post(
    "/optimize",
    # The concrete response below supplies the NDJSON content type. Keeping the
    # decorator's response class media-type-neutral lets the explicit OpenAPI
    # schema describe one typed line instead of an untyped string body.
    response_class=StreamingResponse,
    response_model=OptimizationEvent,
    response_description="A stream of newline-delimited OptimizationEvent objects",
    responses={
        200: {
            "description": "One OptimizationEvent per NDJSON line",
            "content": {
                "application/x-ndjson": {"schema": _OPTIMIZATION_EVENT_SCHEMA}
            },
        },
        413: {"description": "The request body exceeds 8 MiB"},
        429: {"description": "The service is already at its study limit"},
    },
)
async def optimize(
    request: Request, optimization_input: OptimizationInput
) -> StreamingResponse:
    """Optimize flat parameters of one selected scenario."""
    await _acquire_optimization_slot(request.app)
    return NDJSONStreamingResponse(
        _stream_with_admission_slot(request, optimization_input),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/status")
def get_status() -> AppStatus:
    """Return process-level status for container and infrastructure checks."""
    return app.state.status


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HASH_PETRINAUT_OPT_HOST", DEFAULT_HOST)
    port = int(os.getenv("HASH_PETRINAUT_OPT_PORT", str(DEFAULT_PORT)))
    uvicorn.run(app, host=host, port=port)
