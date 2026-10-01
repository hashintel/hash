"""Application-owned optimization resources and admission control."""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from contextlib import suppress
from dataclasses import dataclass

from fastapi import HTTPException

from petrinaut import OptimizationSession
from petrinaut_optimization.events import EventBus
from petrinaut_optimization.optimization_runs import OptimizationRun, OptimizationRunRegistry
from petrinaut_optimization.petrinaut_optimizer import PetrinautOptimizer, PetrinautOptimizerEvents
from petrinaut_optimization.status import Phase, StatusStore
from petrinaut_optimization.tasks import join_task

log = logging.getLogger("pn_api")

MAX_ACTIVE_OPTIMIZATIONS = 4
RETRY_AFTER_SECONDS = 30


def initialize_optimizer(
    optimization_manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
) -> PetrinautOptimizer:
    """Start the session and construct its study on the caller's worker thread."""
    model = OptimizationSession(optimization_manifest)
    try:
        model.start()
        return PetrinautOptimizer(model, bus=bus)
    except Exception:
        model.close(graceful=False)
        raise


@dataclass
class _RunCreation:
    abandoned: bool = False
    run: OptimizationRun | None = None

    def abandon(self) -> None:
        self.abandoned = True
        if self.run is not None:
            self.run.request_cancel("creation request cancelled")


class OptimizationService:
    """Resources shared by requests within one application lifespan."""

    def __init__(self) -> None:
        self.status = StatusStore()
        self.bus = EventBus[PetrinautOptimizerEvents]()
        self.status.subscribe(event_bus=self.bus)
        self.runs = OptimizationRunRegistry()
        self.active_optimizations = 0
        self._admission_lock = asyncio.Lock()
        self._pending_accounts: set[str] = set()
        self._creations: set[asyncio.Task[OptimizationRun]] = set()
        self._shutdown_task: asyncio.Task[None] | None = None

    async def _shutdown(self) -> None:
        await asyncio.gather(*self._creations, return_exceptions=True)
        try:
            await self.runs.shutdown()
        finally:
            await self.bus.shutdown()

    async def shutdown(self) -> None:
        """Join initialization and run cleanup before draining status updates."""
        if self._shutdown_task is None:
            self._shutdown_task = asyncio.create_task(self._shutdown())
        await join_task(self._shutdown_task)

    async def _acquire_slot(self, *, account: str | None, request_id: str | None) -> None:
        async with self._admission_lock:
            if self._shutdown_task is not None:
                raise HTTPException(503, "The optimizer service is shutting down")
            if account is not None and (
                account in self._pending_accounts or self.runs.has_live_run_for_account(account)
            ):
                log.warning(
                    "optimization request rejected: account busy",
                    extra={"event": "account_busy_rejected", "request_id": request_id},
                )
                raise HTTPException(429, "An optimization is already running for this account")
            if self.active_optimizations >= MAX_ACTIVE_OPTIMIZATIONS:
                log.warning(
                    "optimization request rejected: study limit reached",
                    extra={
                        "event": "capacity_rejected",
                        "active_optimizations": self.active_optimizations,
                        "max_active_optimizations": MAX_ACTIVE_OPTIMIZATIONS,
                        "request_id": request_id,
                    },
                )
                raise HTTPException(
                    429,
                    "The optimizer is already running its maximum number of studies",
                    headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
                )
            self.active_optimizations += 1
            if account is not None:
                self._pending_accounts.add(account)

    async def _release_slot(self) -> None:
        async with self._admission_lock:
            self.active_optimizations -= 1

    def _run_cleanup(self, optimizer: PetrinautOptimizer) -> Callable[[], Awaitable[None]]:
        task: asyncio.Task[None] | None = None

        async def close() -> None:
            try:
                with suppress(Exception):
                    await asyncio.to_thread(optimizer.pn_model.close, graceful=False)
            finally:
                await self._release_slot()

        async def cleanup() -> None:
            nonlocal task
            if task is None:
                task = asyncio.create_task(close())
            await join_task(task)

        return cleanup

    def _creation_finished(self, task: asyncio.Task[OptimizationRun]) -> None:
        self._creations.discard(task)
        # An abandoned request has nobody left to retrieve its failure.
        if not task.cancelled():
            task.exception()

    async def create_run(
        self,
        manifest: dict[str, object],
        *,
        account: str | None,
        correlation: Mapping[str, str | None],
    ) -> OptimizationRun:
        """Admit a study, then transfer its session and slot to the detached run."""
        request_id = correlation.get("request_id")
        # A rejected request must not clear another request's pending owner mark.
        await self._acquire_slot(account=account, request_id=request_id)
        creation = _RunCreation()
        task = asyncio.create_task(
            self._create_admitted_run(
                creation, manifest=manifest, account=account, correlation=correlation
            )
        )
        self._creations.add(task)
        task.add_done_callback(self._creation_finished)
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            creation.abandon()
            raise

    def _register_run(
        self,
        creation: _RunCreation,
        *,
        run_id: str,
        optimizer: PetrinautOptimizer,
        cleanup: Callable[[], Awaitable[None]],
        account: str | None,
        correlation: Mapping[str, str | None],
    ) -> OptimizationRun:
        if creation.abandoned or self._shutdown_task is not None:
            raise asyncio.CancelledError
        self.status.update(
            run_id,
            phase=Phase.running,
            detail="Petrinaut session and Optimization Model initialized",
        )
        return self.runs.create_run(
            run_id=run_id,
            optimizer=optimizer,
            cleanup=cleanup,
            correlation=correlation,
            account_id=account,
        )

    async def _create_admitted_run(
        self,
        creation: _RunCreation,
        *,
        manifest: dict[str, object],
        account: str | None,
        correlation: Mapping[str, str | None],
    ) -> OptimizationRun:
        run_id: str | None = None
        cleanup: Callable[[], Awaitable[None]] | None = None
        try:
            run_id = self.status.create().run_id
            optimizer = await asyncio.to_thread(initialize_optimizer, manifest, bus=self.bus)
            cleanup = self._run_cleanup(optimizer)
            creation.run = self._register_run(
                creation,
                run_id=run_id,
                optimizer=optimizer,
                cleanup=cleanup,
                correlation=correlation,
                account=account,
            )
        except BaseException as error:
            await join_task(
                asyncio.ensure_future(cleanup() if cleanup is not None else self._release_slot())
            )
            if not isinstance(error, Exception) or run_id is None:
                raise
            self.status.update(
                run_id,
                phase=Phase.error,
                detail="Petrinaut session and Optimization Model could NOT be initialized",
            )

            # Backend diagnostics may quote user expressions. Only the response
            # carries their text; logs carry the exception's classification.
            log.exception(
                "optimization initialization failed",
                extra={
                    "event": "initialization_failed",
                    "run_id": run_id,
                    "error_type": type(error).__name__,
                    "request_id": correlation.get("request_id"),
                },
            )
            raise HTTPException(
                500,
                f"failed to initialise optimization: {error}",
                headers={"X-Optimization-Run-ID": run_id},
            ) from error
        else:
            return creation.run
        finally:
            if account is not None:
                self._pending_accounts.discard(account)
