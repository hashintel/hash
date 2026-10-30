"""Typed dependencies composed by FastAPI for each request."""

from dataclasses import dataclass
from typing import Annotated, cast

from fastapi import Depends, Header, HTTPException, Path, Query, Request
from starlette.requests import HTTPConnection

from petrinaut_optimization.optimization_runs import OptimizationRun
from petrinaut_optimization.service import OptimizationService


def get_service(connection: HTTPConnection) -> OptimizationService:
    return cast("OptimizationService", connection.scope["state"]["service"])


Service = Annotated[OptimizationService, Depends(get_service)]


def get_account(
    account: Annotated[str | None, Header(alias="x-hash-account-id")] = None,
) -> str | None:
    return (account or "").strip() or None


AccountId = Annotated[str | None, Depends(get_account)]
RequestId = Annotated[str | None, Header(alias="x-hash-request-id")]


def get_cursor(
    cursor: Annotated[int | None, Query(ge=0)] = None,
    last_event_id: Annotated[str | None, Header()] = None,
) -> int:
    if cursor is not None:
        return cursor
    try:
        return max(0, int(last_event_id or "0"))
    except ValueError:
        return 0


Cursor = Annotated[int, Depends(get_cursor)]


@dataclass(kw_only=True)
class RequestContext:
    service: Service
    account: AccountId
    request_id: RequestId = None

    @property
    def correlation(self) -> dict[str, str | None]:
        return {"request_id": self.request_id}


@dataclass(kw_only=True)
class RunContext(RequestContext):
    run_id: Annotated[str, Path()]

    @property
    def run(self) -> OptimizationRun:
        run = self.service.runs.get(self.run_id)
        if run is None or (run.account_id is not None and run.account_id != self.account):
            raise HTTPException(404, f"optimization run not found: {self.run_id}")
        return run


@dataclass(kw_only=True)
class EventsContext(RunContext):
    request: Request
    cursor: Cursor = 0


Creation = Annotated[RequestContext, Depends()]
Run = Annotated[RunContext, Depends()]
Events = Annotated[EventsContext, Depends()]
