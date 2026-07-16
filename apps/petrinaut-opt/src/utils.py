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
    phase: Phase = Phase.idle
    detail: str | None = None
    updated_at: datetime | None = None


class RunStatus(AppStatus):
    run_id: str


class StatusStore:
    """Compatibility registry for the run-scoped status API on the base branch."""

    def __init__(self) -> None:
        self._statuses: dict[str, RunStatus] = {}
        self._lock = Lock()

    def create(self) -> RunStatus:
        status = RunStatus(
            run_id=str(uuid4()),
            updated_at=datetime.now(timezone.utc),
        )
        with self._lock:
            self._statuses[status.run_id] = status
        return status

    def update(self, run_id: str, **changes: object) -> RunStatus:
        with self._lock:
            current = self._statuses[run_id]
            updated = current.model_copy(
                update={**changes, "updated_at": datetime.now(timezone.utc)}
            )
            self._statuses[run_id] = updated
            return updated

    def get(self, run_id: str) -> RunStatus | None:
        with self._lock:
            return self._statuses.get(run_id)

    def all(self) -> list[RunStatus]:
        with self._lock:
            return list(self._statuses.values())


def set_status(
    app: FastAPI, run_id: str | None = None, **changes: object
) -> AppStatus:
    if run_id is not None:
        return app.state.statuses.update(run_id, **changes)

    current = app.state.status
    app.state.status = current.model_copy(
        update={**changes, "updated_at": datetime.now(timezone.utc)}
    )
    return app.state.status
