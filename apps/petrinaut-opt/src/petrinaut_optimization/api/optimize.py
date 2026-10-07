"""Creation, cancellation and event attachment for detached optimization runs."""

import logging
from typing import override

from fastapi import APIRouter, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.types import Receive, Scope, Send

from petrinaut_optimization.api.context import Creation, Events, EventsContext, Run
from petrinaut_optimization.optimization_runs import OptimizationRun, attachment_event_stream

log = logging.getLogger("pn_api")
optimize_router = APIRouter()
run_router = APIRouter(prefix="/runs/{run_id}")


class OptimizationRunCreated(BaseModel):
    """Response body of a successful detached-run creation."""

    run_id: str


@optimize_router.post(
    "/runs",
    status_code=201,
    responses={
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
    },
)
async def post_optimize_runs(
    context: Creation, optimization_manifest: dict[str, object], response: Response
) -> OptimizationRunCreated:
    """Start a detached run owned by the account stamped by the authenticated proxy."""
    run = await context.service.create_run(
        optimization_manifest, account=context.account, correlation=context.correlation
    )
    response.headers["X-Optimization-Run-ID"] = run.run_id
    return OptimizationRunCreated(run_id=run.run_id)


@run_router.delete(
    "",
    status_code=204,
    responses={
        204: {
            "description": (
                "The run was cancelled (or had already reached a terminal "
                "state); when this call stopped it, the event log's terminal "
                "frame is `event: cancelled`"
            ),
        },
        404: {"description": "No optimization run with this id is registered"},
    },
)
async def delete_optimize_run(context: Run) -> Response:
    """Cancel a detached run and wait for its resources to be released."""
    run = context.run
    if run.request_cancel("cancelled by client request"):
        log.info(
            "optimization run cancellation requested",
            extra={
                "event": "run_cancel_requested",
                "run_id": run.run_id,
                **context.correlation,
            },
        )
    await run.finished.wait()
    return Response(status_code=204)


class _RunEventsResponse(StreamingResponse):
    def __init__(self, context: EventsContext, *, run: OptimizationRun, epoch: int) -> None:
        self._run = run
        self._epoch = epoch
        super().__init__(
            attachment_event_stream(
                run,
                cursor=context.cursor,
                epoch=epoch,
                is_disconnected=context.request.is_disconnected,
                correlation=context.correlation,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-Optimization-Run-ID": run.run_id,
                "X-Requested-Trials": str(run.requested_trials),
            },
        )

    @override
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            # A failed response start never enters the iterator's finally and
            # Starlette skips background tasks when sending the response raises.
            self._run.end_attachment(self._epoch)


@run_router.get(
    "/events",
    response_class=StreamingResponse,
    responses={
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
                        "Trial count requested by the run's manifest, for sizing synthesized summaries"
                    ),
                    "schema": {"type": "string"},
                },
            },
        },
        404: {"description": "No optimization run with this id is registered"},
    },
)
async def get_optimize_run_events(context: Events) -> StreamingResponse:
    """Replay after the cursor, then tail without tying the run to this connection."""
    run = context.run
    return _RunEventsResponse(context, run=run, epoch=run.begin_attachment())


optimize_router.include_router(run_router)
