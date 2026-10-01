"""Cancellation schedules that must retain session and admission ownership."""

import asyncio
import threading
from collections.abc import Callable, Mapping
from typing import override

import pytest
from fastapi import HTTPException

from petrinaut_optimization import service as service_module
from petrinaut_optimization.events import EventBus
from petrinaut_optimization.optimization_runs import CANCELLED_FRAME, RunState
from petrinaut_optimization.petrinaut_optimizer import PetrinautOptimizer, PetrinautOptimizerEvents
from petrinaut_optimization.service import OptimizationService
from petrinaut_optimizer_core import Scalar


async def cancel_repeatedly[T](task: asyncio.Future[T], *, count: int) -> None:
    for _ in range(count):
        task.cancel()
        await asyncio.sleep(0)


class ClaimOnceModel:
    """Only the first close joins the process, as in the real transport."""

    def __init__(self, description: dict[str, object]) -> None:
        self.description = description
        self.close_started = threading.Event()
        self.close_release = threading.Event()
        self.closed = threading.Event()
        self.close_calls = 0
        self._lock = threading.Lock()

    def describe(self) -> dict[str, object]:
        return self.description

    @staticmethod
    def objective(_values: dict[str, Scalar]) -> float:
        return 1.0

    def close(self, *, graceful: bool = True) -> None:
        del graceful
        with self._lock:
            self.close_calls += 1
            if self.close_calls > 1:
                return
        self.close_started.set()
        if not self.close_release.wait(timeout=5):
            raise TimeoutError("test did not release session close")
        self.closed.set()


class CompletingOptimizer(PetrinautOptimizer):
    """Leave session shutdown to the registry's cleanup rather than the pump."""

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
        del run_id, n_trials, cancel_event, correlation
        on_event("event: done\ndata: {}\n\n")
        if on_outcome is not None:
            on_outcome("completed")
        return "completed"


@pytest.mark.asyncio
@pytest.mark.parametrize("cancellations", [1, 2])
async def test_creation_abandoned_shutdown(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    cancellations: int,
) -> None:
    service = OptimizationService()
    started = threading.Event()
    release = threading.Event()
    model = ClaimOnceModel(optimization_description)

    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> PetrinautOptimizer:
        started.set()
        if not release.wait(timeout=5):
            raise TimeoutError("test did not release initialization")
        return PetrinautOptimizer(model, bus=bus)

    monkeypatch.setattr(service_module, "initialize_optimizer", initialize)
    request = asyncio.create_task(service.create_run({}, account="owner", correlation={}))
    shutdown: asyncio.Task[None] | None = None
    try:
        assert await asyncio.to_thread(started.wait, 2)
        await cancel_repeatedly(request, count=cancellations)
        assert service.active_optimizations == 1
        assert service._pending_accounts == {"owner"}
        with pytest.raises(HTTPException) as rejected:
            await service.create_run({}, account="owner", correlation={})
        assert rejected.value.status_code == 429

        shutdown = asyncio.create_task(service.shutdown())
        await asyncio.sleep(0)
        with pytest.raises(HTTPException) as closing:
            await service.create_run({}, account="another", correlation={})
        assert closing.value.status_code == 503
        assert not shutdown.done()
        assert not service.bus.closed
        release.set()
        assert await asyncio.to_thread(model.close_started.wait, 2)
        await cancel_repeatedly(shutdown, count=2)
        assert not shutdown.done()
        assert service.active_optimizations == 1
        assert service._pending_accounts == {"owner"}
        assert not service.bus.closed
        model.close_release.set()
        with pytest.raises(asyncio.CancelledError):
            await shutdown
        assert model.closed.is_set()
        assert model.close_calls == 1
        assert service.active_optimizations == 0
        assert not service._pending_accounts
        assert service.bus.closed
    finally:
        release.set()
        model.close_release.set()
        await asyncio.gather(request, return_exceptions=True)
        if shutdown is not None:
            await asyncio.gather(shutdown, return_exceptions=True)
        await service.shutdown()


@pytest.mark.asyncio
async def test_registry_unpolled_cleanup(
    optimization_description: dict[str, object],
) -> None:
    service = OptimizationService()
    model = ClaimOnceModel(optimization_description)
    model.close_release.set()
    service.active_optimizations = 1
    optimizer = CompletingOptimizer(model, bus=service.bus)
    run = service.runs.create_run(
        run_id=service.status.create().run_id,
        optimizer=optimizer,
        cleanup=service._run_cleanup(optimizer),
    )
    assert not run.finished.is_set()
    try:
        await service.runs.shutdown()
        assert model.closed.is_set()
        assert service.active_optimizations == 0
        assert run.finished.is_set()
    finally:
        await service.shutdown()


@pytest.mark.asyncio
@pytest.mark.parametrize("optimizer_type", [PetrinautOptimizer, CompletingOptimizer])
async def test_shutdown_joins_close(
    optimization_description: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    optimizer_type: type[PetrinautOptimizer],
) -> None:
    service = OptimizationService()
    model = ClaimOnceModel(optimization_description)
    optimizer = optimizer_type(model, bus=service.bus)
    monkeypatch.setattr(service_module, "initialize_optimizer", lambda *_args, **_kwargs: optimizer)
    shutdown: asyncio.Task[None] | None = None
    run = await service.create_run({}, account="owner", correlation={})
    try:
        assert await asyncio.to_thread(model.close_started.wait, 2)
        assert run.events[-1][1] == "event: done\ndata: {}\n\n"
        task = run.task
        assert task is not None
        shutdown = asyncio.create_task(service.shutdown())
        done, _pending = await asyncio.wait({shutdown}, timeout=0.01)
        assert not done
        assert task.cancelling() > 0
        task.cancel()
        await asyncio.sleep(0)
        assert not shutdown.done()
        assert not run.finished.is_set()
        assert service.active_optimizations == 1
        assert model.close_calls == 1
        assert not service.bus.closed
        model.close_release.set()
        await shutdown
        assert model.closed.is_set()
        assert run.finished.is_set()
        assert run.state is RunState.completed
        assert CANCELLED_FRAME not in [frame for _sequence, frame in run.events]
        assert service.active_optimizations == 0
        assert service.bus.closed
    finally:
        model.close_release.set()
        if shutdown is not None:
            await asyncio.gather(shutdown, return_exceptions=True)
        await service.shutdown()


@pytest.mark.asyncio
async def test_cleanup_concurrent_join(
    optimization_description: dict[str, object],
) -> None:
    service = OptimizationService()
    model = ClaimOnceModel(optimization_description)
    optimizer = PetrinautOptimizer(model, bus=service.bus)
    service.active_optimizations = 1
    cleanup = service._run_cleanup(optimizer)
    first = asyncio.ensure_future(cleanup())
    second: asyncio.Task[None] | None = None
    try:
        assert await asyncio.to_thread(model.close_started.wait, 2)
        first.cancel()
        second = asyncio.ensure_future(cleanup())
        await asyncio.sleep(0)
        first.cancel()
        await asyncio.sleep(0)
        assert not first.done()
        assert not second.done()
        assert model.close_calls == 1
        assert service.active_optimizations == 1
        model.close_release.set()
        with pytest.raises(asyncio.CancelledError):
            await first
        await second
        assert model.closed.is_set()
        assert service.active_optimizations == 0
    finally:
        model.close_release.set()
        await asyncio.gather(first, return_exceptions=True)
        if second is not None:
            await asyncio.gather(second, return_exceptions=True)
        await service.shutdown()
