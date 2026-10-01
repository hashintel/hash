"""Registration handoff and failed-outcome teardown interleavings."""

import asyncio
import threading
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from typing import override

import pytest
import pytest_asyncio
from fastapi import HTTPException

from petrinaut import PetrinautClientError
from petrinaut_optimization import service as service_module
from petrinaut_optimization.events import EventBus
from petrinaut_optimization.optimization_runs import (
    CANCELLED_FRAME,
    OptimizationRun,
    RunOptimizer,
    RunState,
)
from petrinaut_optimization.petrinaut_optimizer import PetrinautOptimizer, PetrinautOptimizerEvents
from petrinaut_optimization.service import OptimizationService
from petrinaut_optimization.status import Phase
from petrinaut_optimizer_core import Scalar


class GatedModel:
    """Hold the first session close until the test releases its thread gate."""

    def __init__(self, description: dict[str, object], *, fail: bool = False) -> None:
        self.description = description
        self.fail = fail
        self.close_started = threading.Event()
        self.close_release = threading.Event()
        self.closed = threading.Event()
        self.close_calls = 0
        self._lock = threading.Lock()

    def describe(self) -> dict[str, object]:
        return self.description

    def objective(self, _values: dict[str, Scalar]) -> float:
        if self.fail:
            raise PetrinautClientError("controlled worker failure")
        return 1.0

    def close(self, *, graceful: bool = True) -> None:
        del graceful
        with self._lock:
            if self.close_calls:
                return
            self.close_calls += 1
        self.close_started.set()
        if not self.close_release.wait(timeout=5):
            raise TimeoutError("test did not release session close")
        self.closed.set()


class WaitingOptimizer(PetrinautOptimizer):
    """Do not decide the run's outcome before the registration cancellation."""

    @override
    async def pump_events(
        self,
        run_id: str,
        n_trials: int,
        *,
        on_event: Callable[[str], object],
        cancel_event: asyncio.Event,
        on_outcome: Callable[[str], object] | None = None,
        correlation: Mapping[str, str | None] | None = None,
    ) -> str:
        del run_id, n_trials, on_event, correlation
        await cancel_event.wait()
        if on_outcome is not None:
            on_outcome("cancelled")
        return "cancelled"


@pytest_asyncio.fixture
async def service() -> AsyncIterator[OptimizationService]:
    active = OptimizationService()
    try:
        yield active
    finally:
        await active.shutdown()


def _install_handoff_cancellation(
    service: OptimizationService,
    monkeypatch: pytest.MonkeyPatch,
    cancel_at: str,
    *,
    get_request: Callable[[], asyncio.Task[OptimizationRun] | None],
) -> None:
    if cancel_at == "registration":
        original = service.runs.create_run

        def register(
            *,
            run_id: str,
            optimizer: RunOptimizer,
            cleanup: Callable[[], Awaitable[None]],
            correlation: Mapping[str, str | None] | None = None,
            account_id: str | None = None,
        ) -> OptimizationRun:
            run = original(
                run_id=run_id,
                optimizer=optimizer,
                cleanup=cleanup,
                correlation=correlation,
                account_id=account_id,
            )
            request = get_request()
            assert request is not None
            request.cancel()
            return run

        monkeypatch.setattr(service.runs, "create_run", register)
    else:
        original_callback = service._creation_finished

        def creation_done(task: asyncio.Task[OptimizationRun]) -> None:
            original_callback(task)
            request = get_request()
            assert request is not None
            request.cancel()

        monkeypatch.setattr(service, "_creation_finished", creation_done)


async def _assert_abandoned_owner(service: OptimizationService, run: OptimizationRun) -> None:
    assert service.active_optimizations == 1
    assert not run.finished.is_set()
    assert service.runs.has_live_run_for_account("owner")
    assert not service._pending_accounts
    with pytest.raises(HTTPException) as rejected:
        await service.create_run({}, account="owner", correlation={})
    assert rejected.value.status_code == 429


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel_at", ["registration", "creation_callback"])
async def test_creation_cancel_at_handoff(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    cancel_at: str,
    *,
    service: OptimizationService,
) -> None:
    """An abandoned request cannot orphan a run after ownership transfers."""
    model = GatedModel(optimization_description)
    optimizer = WaitingOptimizer(model, bus=service.bus)

    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> PetrinautOptimizer:
        assert bus is service.bus
        return optimizer

    monkeypatch.setattr(service_module, "initialize_optimizer", initialize)
    request: asyncio.Task[OptimizationRun] | None = None
    _install_handoff_cancellation(service, monkeypatch, cancel_at, get_request=lambda: request)
    shutdown: asyncio.Task[None] | None = None
    try:
        request = asyncio.create_task(service.create_run({}, account="owner", correlation={}))
        request_done = asyncio.Event()
        request.add_done_callback(lambda _task: request_done.set())
        await asyncio.wait_for(request_done.wait(), 3)
        with pytest.raises(asyncio.CancelledError):
            await request
        runs = service.runs.runs()
        assert len(runs) == 1
        run = runs[0]
        assert run.cancel_requested.is_set()
        assert await asyncio.to_thread(model.close_started.wait, 2)
        await _assert_abandoned_owner(service, run)
        shutdown = asyncio.create_task(service.shutdown())
        await asyncio.sleep(0)  # Let shutdown create its owned join task.
        shutdown.cancel()
        await asyncio.sleep(0)  # Let the cancelled waiter reach join_task.
        assert not shutdown.done()
        assert not service.bus.closed
        model.close_release.set()
        with pytest.raises(asyncio.CancelledError):
            await shutdown
        await service.shutdown()
        assert run.state is RunState.cancelled
        assert [frame for _sequence, frame in run.events].count(CANCELLED_FRAME) == 1
        assert run.finished.is_set()
        assert model.closed.is_set()
        assert model.close_calls == 1
        assert service.active_optimizations == 0
        assert service.bus.closed
    finally:
        model.close_release.set()
        if request is not None:
            await asyncio.gather(request, return_exceptions=True)
        if shutdown is not None:
            await asyncio.gather(shutdown, return_exceptions=True)
        await service.shutdown()


@pytest.mark.asyncio
async def test_failed_outcome_survives_close(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    service: OptimizationService,
) -> None:
    """A decided error frame and status survive a close interrupted by shutdown."""
    model = GatedModel(optimization_description, fail=True)
    optimizer = PetrinautOptimizer(model, bus=service.bus)
    monkeypatch.setattr(service_module, "initialize_optimizer", lambda *_args, **_kwargs: optimizer)
    shutdown: asyncio.Task[None] | None = None
    try:
        run = await service.create_run({}, account="owner", correlation={})
        assert await asyncio.to_thread(model.close_started.wait, 2)
        frames = list(run.events)
        assert len(frames) == 1
        assert '"state": "ERROR"' in frames[0][1]
        assert not run.finished.is_set()
        shutdown = asyncio.create_task(service.shutdown())
        await asyncio.sleep(0)  # Start shutdown while the session close is blocked.
        assert run.task is not None
        run.task.cancel()  # Deliver cancellation inside the already-decided close.
        assert run.task.cancelling() > 0
        shutdown.cancel()
        await asyncio.sleep(0)  # Exercise repeated cancellation of joiners.
        assert not shutdown.done()
        assert service.active_optimizations == 1
        assert not service.bus.closed
        model.close_release.set()
        with pytest.raises(asyncio.CancelledError):
            await shutdown
        await service.shutdown()
        assert run.state is RunState.failed
        assert run.events == frames
        assert CANCELLED_FRAME not in [frame for _sequence, frame in run.events]
        assert run.finished.is_set()
        assert model.closed.is_set()
        assert model.close_calls == 1
        assert service.active_optimizations == 0
        status = service.status.get(run.run_id)
        assert status is not None
        assert status.phase is Phase.error
        assert service.bus.closed
    finally:
        model.close_release.set()
        if shutdown is not None:
            await asyncio.gather(shutdown, return_exceptions=True)
        await service.shutdown()
