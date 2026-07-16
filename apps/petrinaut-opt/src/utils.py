from datetime import datetime, timezone
from enum import Enum
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

def set_status(app: FastAPI, **changes):
    """Atomically replace the app-wide status, stamping the update time.

    Args:
        app (FastAPI): The app whose `state.status` is updated.
        **changes: Fields to overwrite on the current `AppStatus` (e.g. `phase`, `detail`).
    """
    current = app.state.status
    app.state.status = current.model_copy(
        update={**changes, "updated_at": datetime.now(timezone.utc)}
    )