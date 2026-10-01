"""Read snapshots of retained optimization status rows."""

from fastapi import APIRouter, HTTPException

from petrinaut_optimization.api.context import Service
from petrinaut_optimization.status import RunStatus

status_router = APIRouter()


@status_router.get("")
def get_status(service: Service) -> list[RunStatus]:
    """Return a snapshot of every optimization run's status."""
    return service.status.all()


@status_router.get("/{run_id}")
def get_run_status(run_id: str, service: Service) -> RunStatus:
    """Return the status of one optimization run."""
    status = service.status.get(run_id)

    if status is None:
        raise HTTPException(404, f"optimization run not found: {run_id}")

    return status
