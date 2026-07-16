"""Dynamic Optuna studies backed by one Petrinaut CLI process."""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import AsyncIterator
from typing import Any, Protocol, cast

import optuna

from src.optimization_models import (
    CategoricalDomain,
    ContinuousDomain,
    IntegerDomain,
    OptimizationBest,
    OptimizationCompleteEvent,
    OptimizationErrorEvent,
    OptimizationEvent,
    OptimizationInput,
    OptimizationStartedEvent,
    OptimizationTrialEvent,
    Scalar,
)
from src.petrinaut_client import (
    PetrinautClient,
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)


log = logging.getLogger("petrinaut_optimizer")
optuna.logging.set_verbosity(optuna.logging.ERROR)

_WORKER_DONE = object()
_DISCONNECT_POLL_SECONDS = 0.1
_WORKER_SHUTDOWN_TIMEOUT_SECONDS = 12
_OPTIMIZATION_TIMEOUT_SECONDS = 14 * 60


class DisconnectProbe(Protocol):
    async def is_disconnected(self) -> bool: ...


class PetrinautOptimizer:
    """Optimize a flat set of selected scenario-parameter identifiers."""

    def __init__(self, optimization_input: OptimizationInput, client: PetrinautClient):
        self.input = optimization_input
        self.client = client
        sampler_seed = optimization_input.execution.seed
        if optimization_input.optimization.sampler == "tpe":
            sampler: optuna.samplers.BaseSampler = optuna.samplers.TPESampler(
                seed=sampler_seed
            )
        else:
            sampler = optuna.samplers.RandomSampler(seed=sampler_seed)
        self.study = optuna.create_study(
            study_name=optimization_input.name,
            direction=optimization_input.objective.direction,
            sampler=sampler,
        )

    def _suggest(self, trial: optuna.Trial) -> dict[str, Scalar]:
        suggestions: dict[str, Scalar] = {}
        for variable in self.input.search_space.variables:
            domain = variable.domain
            if isinstance(domain, ContinuousDomain):
                suggestions[variable.identifier] = trial.suggest_float(
                    variable.identifier,
                    float(domain.minimum),
                    float(domain.maximum),
                    log=domain.scale == "log",
                )
            elif isinstance(domain, IntegerDomain):
                suggestions[variable.identifier] = trial.suggest_int(
                    variable.identifier,
                    domain.minimum,
                    domain.maximum,
                    step=domain.step,
                )
            elif isinstance(domain, CategoricalDomain):
                suggestions[variable.identifier] = cast(
                    Scalar,
                    trial.suggest_categorical(variable.identifier, domain.values),
                )
            else:  # pragma: no cover - the Pydantic discriminator is exhaustive
                raise TypeError(f"unsupported optimization domain: {domain!r}")
        return suggestions

    def _objective(self, trial: optuna.Trial) -> float:
        suggestions = self._suggest(trial)
        parameter_values = {
            **self.input.scenario.parameter_values,
            **suggestions,
        }
        return self.client.run_scenario(
            scenario_id=self.input.scenario.id,
            parameter_values=parameter_values,
            metric_id=self.input.objective.metric_id,
            max_time=self.input.execution.max_time,
            dt=self.input.execution.dt,
            seed=self.input.execution.seed,
        )

    @staticmethod
    def _best(study: optuna.Study) -> OptimizationBest | None:
        completed = [
            trial
            for trial in study.get_trials(deepcopy=False)
            if trial.state is optuna.trial.TrialState.COMPLETE
            and trial.value is not None
        ]
        if not completed:
            return None
        trial = study.best_trial
        return OptimizationBest(
            trial=trial.number,
            parameters=cast(dict[str, Scalar], dict(trial.params)),
            objective=float(cast(float, trial.value)),
        )

    @classmethod
    def _trial_event(
        cls, study: optuna.Study, trial: optuna.trial.FrozenTrial
    ) -> OptimizationTrialEvent:
        states = {
            optuna.trial.TrialState.COMPLETE: "complete",
            optuna.trial.TrialState.PRUNED: "pruned",
            optuna.trial.TrialState.FAIL: "failed",
        }
        return OptimizationTrialEvent(
            type="trial",
            trial=trial.number,
            parameters=cast(dict[str, Scalar], dict(trial.params)),
            objective=float(trial.value) if trial.value is not None else None,
            state=cast(Any, states.get(trial.state, "failed")),
            best=cls._best(study),
        )

    def _complete_event(self) -> OptimizationCompleteEvent:
        trials = self.study.get_trials(deepcopy=False)
        return OptimizationCompleteEvent(
            type="complete",
            requested_trials=self.input.optimization.trials,
            completed_trials=sum(
                trial.state is optuna.trial.TrialState.COMPLETE for trial in trials
            ),
            pruned_trials=sum(
                trial.state is optuna.trial.TrialState.PRUNED for trial in trials
            ),
            failed_trials=sum(
                trial.state is optuna.trial.TrialState.FAIL for trial in trials
            ),
            best=self._best(self.study),
        )

    async def stream(self, request: DisconnectProbe) -> AsyncIterator[OptimizationEvent]:
        """Yield typed events and stop the CLI when the consumer disconnects."""
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[OptimizationTrialEvent | Exception | object] = (
            asyncio.Queue()
        )
        stop_requested = threading.Event()
        worker_task: asyncio.Task[None] | None = None

        def enqueue(item: OptimizationTrialEvent | Exception | object) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, item)

        def on_trial(
            study: optuna.Study, trial: optuna.trial.FrozenTrial
        ) -> None:
            enqueue(self._trial_event(study, trial))
            if stop_requested.is_set():
                study.stop()

        def run_study() -> None:
            try:
                self.study.optimize(
                    self._objective,
                    n_trials=self.input.optimization.trials,
                    callbacks=[on_trial],
                    catch=(PetrinautRunError,),
                )
            except Exception as error:  # surfaced as the terminal stream event
                enqueue(error)
            finally:
                enqueue(_WORKER_DONE)

        try:
            try:
                await asyncio.to_thread(self.client.start)
            except Exception as error:
                yield OptimizationErrorEvent(
                    type="error",
                    code="petrinaut_start_failed",
                    message=str(error),
                    retryable=False,
                )
                return

            worker_task = asyncio.create_task(asyncio.to_thread(run_study))
            yield OptimizationStartedEvent(
                type="started",
                requested_trials=self.input.optimization.trials
            )
            deadline = loop.time() + _OPTIMIZATION_TIMEOUT_SECONDS

            while True:
                if await request.is_disconnected():
                    return
                remaining = deadline - loop.time()
                if remaining <= 0:
                    yield OptimizationErrorEvent(
                        type="error",
                        code="optimization_timeout",
                        message="The optimization exceeded its 14-minute deadline",
                        retryable=False,
                    )
                    return
                try:
                    item = await asyncio.wait_for(
                        queue.get(), timeout=min(_DISCONNECT_POLL_SECONDS, remaining)
                    )
                except asyncio.TimeoutError:
                    continue

                if item is _WORKER_DONE:
                    yield self._complete_event()
                    return
                if isinstance(item, Exception):
                    if isinstance(item, PetrinautProtocolError):
                        code = "petrinaut_protocol_failed"
                    elif isinstance(item, PetrinautClientError):
                        code = "petrinaut_transport_failed"
                    else:
                        code = "optimization_failed"
                    yield OptimizationErrorEvent(
                        type="error",
                        code=code,
                        message=str(item),
                        retryable=False,
                    )
                    return
                yield cast(OptimizationEvent, item)
        finally:
            stop_requested.set()
            await asyncio.to_thread(self.client.close)
            if worker_task is not None:
                try:
                    await asyncio.wait_for(
                        worker_task, timeout=_WORKER_SHUTDOWN_TIMEOUT_SECONDS
                    )
                except asyncio.TimeoutError:
                    log.error("Petrinaut optimizer worker did not stop after disconnect")
