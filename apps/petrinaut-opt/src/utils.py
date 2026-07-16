from datetime import datetime, timezone
from enum import Enum
from threading import Lock
from uuid import uuid4

from pydantic import BaseModel

from fastapi import FastAPI

# ── Helper classes and functions for API status ─────────────────────────────────────────────────────────────────
class Phase(str, Enum):
    idle = "idle"
    running = "running"
    done = "done"
    error = "error"

class AppStatus(BaseModel):
    run_id: str
    phase: Phase = Phase.idle
    detail: str | None = None
    updated_at: datetime | None = None

class StatusStore:
    """Thread-safe registry of statuses for optimization runs."""

    def __init__(self) -> None:
        self._statuses: dict[str, AppStatus] = {}
        self._lock = Lock()

    def create(self) -> AppStatus:
        """Create and register an idle status for a new optimization run."""
        status = AppStatus(
            run_id=str(uuid4()),
            updated_at=datetime.now(timezone.utc),
        )
        with self._lock:
            self._statuses[status.run_id] = status
        return status

    def update(self, run_id: str, **changes) -> AppStatus:
        """Atomically update and return one optimization run's status."""
        with self._lock:
            current = self._statuses[run_id]
            updated = current.model_copy(
                update={**changes, "updated_at": datetime.now(timezone.utc)}
            )
            self._statuses[run_id] = updated
            return updated

    def get(self, run_id: str) -> AppStatus | None:
        """Return one run's status, if it exists."""
        with self._lock:
            return self._statuses.get(run_id)

    def all(self) -> list[AppStatus]:
        """Return a snapshot of all run statuses in creation order."""
        with self._lock:
            return list(self._statuses.values())


def set_status(app: FastAPI, run_id: str, **changes) -> AppStatus:
    """Update one run's status, stamping the update time.

    Args:
        app (FastAPI): The app whose `state.statuses` registry is updated.
        run_id (str): Identifier of the optimization run to update.
        **changes: Fields to overwrite on the current `AppStatus` (e.g. `phase`, `detail`).

    Returns:
        AppStatus: The updated status.
    """
    return app.state.statuses.update(run_id, **changes)
