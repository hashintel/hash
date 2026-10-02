"""Retained run statuses, updated by subscribers to the optimizer event bus."""

from collections.abc import Mapping
from contextlib import suppress
from datetime import UTC, datetime
from enum import StrEnum
from threading import Lock
from uuid import uuid4

from pydantic import BaseModel

from petrinaut_optimization.events import EventBus, Pipeline, Subscriber, only

MAX_STATUS_HISTORY = 100


class StatusStoreUpdateEvent(BaseModel):
    run_id: str | None
    changes: Mapping[str, object]


class Phase(StrEnum):
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
    """Bounded, thread-safe registry for the run-scoped status API."""

    def __init__(self, max_history: int = MAX_STATUS_HISTORY) -> None:
        if max_history < 1:
            raise ValueError("status history limit must be positive")

        self._statuses: dict[str, RunStatus] = {}
        self._lock = Lock()
        self._max_history = max_history

    def create(self) -> RunStatus:
        status = RunStatus(
            run_id=str(uuid4()),
            updated_at=datetime.now(UTC),
        )

        with self._lock:
            while len(self._statuses) >= self._max_history:
                oldest_run_id = next(
                    (
                        run_id
                        for run_id, current in self._statuses.items()
                        if current.phase is not Phase.running
                    ),
                    next(iter(self._statuses)),
                )
                del self._statuses[oldest_run_id]
            self._statuses[status.run_id] = status

        return status

    def update(self, run_id: str, **changes: object) -> RunStatus:
        with self._lock:
            current = self._statuses[run_id]
            updated = current.model_copy(update={**changes, "updated_at": datetime.now(UTC)})

            self._statuses[run_id] = updated
            return updated

    def get(self, run_id: str) -> RunStatus | None:
        with self._lock:
            return self._statuses.get(run_id)

    def all(self) -> list[RunStatus]:
        with self._lock:
            return list(self._statuses.values())

    async def _subscribe(self, subscriber: Subscriber[tuple[str, Mapping[str, object]]]) -> None:
        async with subscriber:
            async for value in subscriber:
                # An event queued before history eviction can outlive its row.
                with suppress(KeyError):
                    self.update(value[0], **value[1])

    def subscribe(self, *, event_bus: EventBus[StatusStoreUpdateEvent]) -> None:
        pipeline = Pipeline(only(StatusStoreUpdateEvent)).then(
            lambda event: (event.run_id, event.changes) if event.run_id is not None else None
        )

        subscriber = event_bus.subscribe(middleware=pipeline)
        event_bus.spawn(self._subscribe(subscriber))
