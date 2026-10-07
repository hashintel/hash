"""Assemble the HTTP routes and lifespan-owned service dependencies."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TypedDict

from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI

from petrinaut_optimization.api.body_limit import RequestBodyLimitMiddleware
from petrinaut_optimization.api.health import health_router
from petrinaut_optimization.api.optimize import optimize_router
from petrinaut_optimization.api.status import status_router
from petrinaut_optimization.service import OptimizationService
from petrinaut_optimization.telemetry import Telemetry

load_dotenv(find_dotenv(usecwd=True))
telemetry = Telemetry()


class LifespanState(TypedDict):
    service: OptimizationService


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[LifespanState]:
    service = OptimizationService()
    try:
        # Starlette shallow-copies this mapping into each connection's scope.
        yield {"service": service}
    finally:
        try:
            await service.shutdown()
        finally:
            telemetry.flush()


app = FastAPI(title="Petrinaut optimization Python API", lifespan=lifespan)
app.add_middleware(RequestBodyLimitMiddleware)
app.include_router(optimize_router, prefix="/optimize")
app.include_router(status_router, prefix="/status")
app.include_router(health_router, prefix="/health")
telemetry.setup(app)


@app.get("/")
async def root() -> dict[str, str]:
    """Return a welcome message for the API root."""
    return {"message": "Welcome to Petrinaut optimization API"}
