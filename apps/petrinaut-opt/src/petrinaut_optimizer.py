#!/usr/bin/env python3
"""Optuna study orchestration backed by the Petrinaut optimization protocol."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import queue
import threading
from collections.abc import AsyncIterator, Callable, Mapping
from datetime import datetime
from typing import Any, Literal, TypeAlias, cast

import optuna
from fastapi import Request
from opentelemetry import context as otel_context, trace
from opentelemetry.trace import Span, Status, StatusCode

from src.petrinaut_client import PetrinautModel, PetrinautRunError
from src.utils import Phase, set_status


log = logging.getLogger("pn_optimize")
tracer = trace.get_tracer("pn_optimize")
optuna.logging.set_verbosity(optuna.logging.WARNING)

SAMPLERS = {
    "tpe": optuna.samplers.TPESampler,
    "random": optuna.samplers.RandomSampler,
}
DEFAULT_STUDY_NAME = "opt_study"
SSE_HEARTBEAT_SECONDS = 30
_DISCONNECT_POLL_SECONDS = 0.1
_WORKER_SHUTDOWN_TIMEOUT_SECONDS = 12
_SENTINEL = object()

Scalar: TypeAlias = int | float | bool
ParameterDescriptor: TypeAlias = Mapping[str, Any]


def _finite_number(value: Any, name: str) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        raise ValueError(f"{name} must be a finite number")
    return float(value)


def _parse_description(
    description: Mapping[str, Any],
) -> tuple[
    Literal["maximize", "minimize"],
    str,
    int,
    int,
    tuple[ParameterDescriptor, ...],
]:
    """Validate only the small, generic optimization protocol contract."""
    direction = description.get("direction")
    if direction not in {"maximize", "minimize"}:
        raise ValueError("optimization.describe direction must be maximize or minimize")

    study = description.get("study")
    if not isinstance(study, dict):
        raise ValueError("optimization.describe omitted its study settings")
    sampler = study.get("sampler")
    if sampler not in SAMPLERS:
        raise ValueError(f"unsupported Optuna sampler: {sampler!r}")
    n_trials = study.get("trials")
    if isinstance(n_trials, bool) or not isinstance(n_trials, int) or n_trials < 1:
        raise ValueError("optimization.describe study.trials must be positive")
    seed = study.get("seed")
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError(
            "optimization.describe study.seed must be a non-negative integer"
        )

    raw_parameters = description.get("parameters")
    if not isinstance(raw_parameters, list):
        raise ValueError("optimization.describe parameters must be an array")

    parameters: list[ParameterDescriptor] = []
    identifiers: set[str] = set()
    for index, parameter in enumerate(raw_parameters):
        if not isinstance(parameter, dict):
            raise ValueError(f"optimization parameter {index} must be an object")
        identifier = parameter.get("identifier")
        if not isinstance(identifier, str) or not identifier:
            raise ValueError(f"optimization parameter {index} has no valid identifier")
        if identifier in identifiers:
            raise ValueError(f'duplicate optimization parameter "{identifier}"')
        identifiers.add(identifier)

        parameter_type = parameter.get("type")
        if parameter_type == "float":
            minimum = _finite_number(parameter.get("minimum"), f"{identifier}.minimum")
            maximum = _finite_number(parameter.get("maximum"), f"{identifier}.maximum")
            scale = parameter.get("scale")
            if minimum >= maximum:
                raise ValueError(f"{identifier}.maximum must exceed minimum")
            if scale not in {"linear", "log"}:
                raise ValueError(f"{identifier}.scale must be linear or log")
            if scale == "log" and minimum <= 0:
                raise ValueError(f"{identifier}.minimum must be positive for log scale")
        elif parameter_type == "int":
            minimum = parameter.get("minimum")
            maximum = parameter.get("maximum")
            step = parameter.get("step")
            scale = parameter.get("scale")
            if (
                isinstance(minimum, bool)
                or not isinstance(minimum, int)
                or isinstance(maximum, bool)
                or not isinstance(maximum, int)
            ):
                raise ValueError(f"{identifier} integer bounds must be integers")
            if minimum >= maximum:
                raise ValueError(f"{identifier}.maximum must exceed minimum")
            if isinstance(step, bool) or not isinstance(step, int) or step < 1:
                raise ValueError(f"{identifier}.step must be a positive integer")
            if scale not in {"linear", "log"}:
                raise ValueError(f"{identifier}.scale must be linear or log")
            if scale == "log" and minimum <= 0:
                raise ValueError(f"{identifier}.minimum must be positive for log scale")
            if scale == "log" and step != 1:
                raise ValueError(f"{identifier}.step must be 1 for log scale")
        elif parameter_type != "boolean":
            raise ValueError(
                f"unsupported optimization parameter type: {parameter_type!r}"
            )

        parameters.append(parameter)

    return (
        cast(Literal["maximize", "minimize"], direction),
        sampler,
        n_trials,
        seed,
        tuple(parameters),
    )


class PetrinautOptimizer:
    """Optimize the flat parameter descriptors supplied by Petrinaut CLI."""

    def __init__(
        self,
        pn_model: PetrinautModel,
        *,
        description: Mapping[str, Any] | None = None,
        **sampler_options: Any,
    ) -> None:
        raw_description = (
            pn_model.describe_optimization() if description is None else description
        )
        direction, sampler_name, n_trials, seed, parameters = _parse_description(
            raw_description
        )

        self.parameters = parameters
        self.study_name = (
            f"{DEFAULT_STUDY_NAME}_{datetime.now().strftime('%m/%d/%Y-%H:%M:%S')}"
        )
        sampler_options.setdefault("seed", seed)
        self.sampler = SAMPLERS[sampler_name](**sampler_options)
        self.direction = direction
        self.n_trials = n_trials
        self.study = optuna.create_study(
            study_name=self.study_name,
            storage=None,
            load_if_exists=False,
            direction=self.direction,
            sampler=self.sampler,
        )
        self.pn_model = pn_model
        self.lock = threading.Lock()

    def suggest(self, trial: optuna.Trial) -> dict[str, Scalar]:
        """Ask Optuna for each non-fixed scenario parameter described by the CLI."""
        values: dict[str, Scalar] = {}
        for parameter in self.parameters:
            identifier = cast(str, parameter["identifier"])
            parameter_type = parameter["type"]
            if parameter_type == "float":
                values[identifier] = trial.suggest_float(
                    identifier,
                    float(parameter["minimum"]),
                    float(parameter["maximum"]),
                    log=parameter["scale"] == "log",
                )
            elif parameter_type == "int":
                values[identifier] = trial.suggest_int(
                    identifier,
                    cast(int, parameter["minimum"]),
                    cast(int, parameter["maximum"]),
                    step=cast(int, parameter["step"]),
                    log=parameter["scale"] == "log",
                )
            else:
                values[identifier] = cast(
                    bool,
                    trial.suggest_categorical(identifier, [False, True]),
                )
        return values

    def objective(self, trial: optuna.Trial) -> float:
        """Propose one flat parameter set and ask Petrinaut to evaluate it."""
        prune_cause: PetrinautRunError | None = None
        with tracer.start_as_current_span("optimization.trial") as span:
            span.set_attribute("optuna.trial.number", trial.number)
            parameter_values = self.suggest(trial)
            try:
                value = self.pn_model.objective(parameter_values)
            except PetrinautRunError as error:
                # Pruning is expected Optuna control flow, not a span failure.
                # Record it as an attribute and re-raise *after* the span closes
                # so it does not trip the default ERROR status / exception event.
                # Genuinely unexpected exceptions still propagate through the
                # `with` block and are recorded as errors as usual.
                span.set_attribute("optuna.trial.pruned", True)
                log.warning(
                    "trial %d failed — pruned",
                    trial.number,
                    extra={"error_type": type(error).__name__},
                )
                prune_cause = error
            else:
                span.set_attribute("optuna.trial.value", value)
                return value

        raise optuna.TrialPruned() from prune_cause

    def _start_study_worker(
        self,
        *,
        n_trials: int,
        callback: Callable[[optuna.Study, optuna.trial.FrozenTrial], None],
        events: asyncio.Queue[dict[str, Any] | object],
        loop: asyncio.AbstractEventLoop,
    ) -> tuple[threading.Thread, Span]:
        """Run the study on a worker thread that inherits the request's context.

        A raw ``threading.Thread`` does not inherit the caller's ``contextvars``,
        so without re-attaching the captured context every ``optimization.trial``
        span would start as a disconnected root instead of a child of the request
        span. The returned ``optimization.study`` span is the parent of those
        trial spans; the caller must ``end()`` it once the stream is torn down.
        """
        study_span = tracer.start_span("optimization.study")
        study_span.set_attribute("optuna.study.trials", n_trials)
        study_span.set_attribute("optuna.study.direction", self.direction)
        run_ctx = trace.set_span_in_context(study_span)

        def run() -> None:
            # Optuna runs trials sequentially (n_jobs=1) on this single thread,
            # so one attach covers every objective() call. If n_jobs ever exceeds
            # 1, each Optuna worker thread would need the context attached too.
            token = otel_context.attach(run_ctx)
            try:
                self.study.optimize(
                    self.objective,
                    n_trials=n_trials,
                    callbacks=[callback],
                )
            except Exception as error:
                study_span.record_exception(error)
                study_span.set_status(Status(StatusCode.ERROR))
                loop.call_soon_threadsafe(
                    events.put_nowait,
                    {"state": "ERROR", "message": str(error)},
                )
            finally:
                otel_context.detach(token)
                loop.call_soon_threadsafe(events.put_nowait, _SENTINEL)

        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        return worker, study_span

    async def stream_all(
        self, request: Request, run_id: str, n_trials: int
    ) -> AsyncIterator[str]:
        """Stream Yannis's per-trial SSE frames, followed by the done frame."""
        app = request.app
        log_context = {
            "request_id": request.headers.get("x-hash-request-id"),
            "run_id": run_id,
        }
        if not self.lock.acquire(blocking=False):
            yield 'event: error\ndata: {"message": "already running"}\n\n'
            return

        set_status(app, run_id, phase=Phase.running, detail="optimization running")
        log.info(
            "optimization study started",
            extra={"event": "study_started", "trials": n_trials, **log_context},
        )
        loop = asyncio.get_running_loop()
        events: asyncio.Queue[dict[str, Any] | object] = asyncio.Queue()
        stop_flag = threading.Event()

        def callback(study: optuna.Study, trial: optuna.trial.FrozenTrial) -> None:
            payload = {
                "step": trial.number,
                "params": dict(trial.params),
                "init_state": {},
                "metric": trial.value,
                "state": trial.state.name,
            }
            loop.call_soon_threadsafe(events.put_nowait, payload)
            if stop_flag.is_set():
                study.stop()

        worker, study_span = self._start_study_worker(
            n_trials=n_trials, callback=callback, events=events, loop=loop
        )
        next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
        completed = False

        try:
            while True:
                if await request.is_disconnected():
                    stop_flag.set()
                    set_status(
                        app,
                        run_id,
                        phase=Phase.idle,
                        detail="client disconnected, stopped",
                    )
                    log.info(
                        "client disconnected, stopping optimization study",
                        extra={"event": "client_disconnected", **log_context},
                    )
                    break
                heartbeat_wait = max(0.0, next_heartbeat - loop.time())
                try:
                    item = await asyncio.wait_for(
                        events.get(),
                        timeout=min(_DISCONNECT_POLL_SECONDS, heartbeat_wait),
                    )
                except asyncio.TimeoutError:
                    if loop.time() >= next_heartbeat:
                        yield ": heartbeat\n\n"
                        next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
                    continue
                if item is _SENTINEL:
                    set_status(
                        app,
                        run_id,
                        phase=Phase.done,
                        detail="optimization completed",
                    )
                    completed = True
                    log.info(
                        "optimization study completed",
                        extra={
                            "event": "study_completed",
                            "trials": n_trials,
                            **log_context,
                        },
                    )
                    yield "event: done\ndata: {}\n\n"
                    break
                event = cast(dict[str, Any], item)
                if event.get("state") == "ERROR":
                    set_status(
                        app,
                        run_id,
                        phase=Phase.error,
                        detail=cast(str, event.get("message")),
                    )
                    log.warning(
                        "optimization study failed",
                        extra={
                            "event": "study_failed",
                            **log_context,
                        },
                    )
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("state") == "ERROR":
                    break
        finally:
            stop_flag.set()
            try:
                # Only a study that ran to completion left the CLI idle enough
                # for the graceful EOF shutdown; every other exit (disconnect,
                # error, cancellation) terminates the process group promptly.
                await asyncio.to_thread(self.pn_model.close, graceful=completed)
                await asyncio.to_thread(worker.join, _WORKER_SHUTDOWN_TIMEOUT_SECONDS)
                if worker.is_alive():
                    log.error(
                        "Petrinaut optimizer worker did not stop after CLI shutdown",
                        extra={"event": "worker_join_timeout", **log_context},
                    )
            finally:
                self.lock.release()
                try:
                    study_span.set_attribute(
                        "optuna.study.best_value", self.study.best_value
                    )
                except ValueError:
                    # No trial completed (immediate disconnect, or all pruned),
                    # so there is no best value to record.
                    pass
                study_span.end()

    async def stream_best(
        self, request: Request, run_id: str, n_trials: int
    ) -> AsyncIterator[str]:
        """Stream Yannis's best-so-far SSE frames, followed by the done frame."""
        app = request.app
        log_context = {
            "request_id": request.headers.get("x-hash-request-id"),
            "run_id": run_id,
        }
        if not self.lock.acquire(blocking=False):
            yield 'event: error\ndata: {"message": "already running"}\n\n'
            return

        set_status(app, run_id, phase=Phase.running, detail="optimization running")
        log.info(
            "optimization study started",
            extra={"event": "study_started", "trials": n_trials, **log_context},
        )
        loop = asyncio.get_running_loop()
        events: asyncio.Queue[dict[str, Any] | object] = asyncio.Queue()
        stop_flag = threading.Event()

        def callback(study: optuna.Study, trial: optuna.trial.FrozenTrial) -> None:
            has_completed = any(
                candidate.state is optuna.trial.TrialState.COMPLETE
                for candidate in study.get_trials(deepcopy=False)
            )
            if has_completed:
                payload = {
                    "step": trial.number,
                    "params": dict(study.best_params),
                    "init_state": {},
                    "metric": study.best_value,
                    "state": "COMPLETE",
                }
                loop.call_soon_threadsafe(events.put_nowait, payload)
            if stop_flag.is_set():
                study.stop()

        worker, study_span = self._start_study_worker(
            n_trials=n_trials, callback=callback, events=events, loop=loop
        )
        next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
        completed = False

        try:
            while True:
                if await request.is_disconnected():
                    stop_flag.set()
                    set_status(
                        app,
                        run_id,
                        phase=Phase.idle,
                        detail="client disconnected, stopped",
                    )
                    log.info(
                        "client disconnected, stopping optimization study",
                        extra={"event": "client_disconnected", **log_context},
                    )
                    break
                heartbeat_wait = max(0.0, next_heartbeat - loop.time())
                try:
                    item = await asyncio.wait_for(
                        events.get(),
                        timeout=min(_DISCONNECT_POLL_SECONDS, heartbeat_wait),
                    )
                except asyncio.TimeoutError:
                    if loop.time() >= next_heartbeat:
                        yield ": heartbeat\n\n"
                        next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
                    continue
                if item is _SENTINEL:
                    set_status(
                        app,
                        run_id,
                        phase=Phase.done,
                        detail="optimization completed",
                    )
                    completed = True
                    log.info(
                        "optimization study completed",
                        extra={
                            "event": "study_completed",
                            "trials": n_trials,
                            **log_context,
                        },
                    )
                    yield "event: done\ndata: {}\n\n"
                    break
                event = cast(dict[str, Any], item)
                if event.get("state") == "ERROR":
                    set_status(
                        app,
                        run_id,
                        phase=Phase.error,
                        detail=cast(str, event.get("message")),
                    )
                    log.warning(
                        "optimization study failed",
                        extra={
                            "event": "study_failed",
                            **log_context,
                        },
                    )
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("state") == "ERROR":
                    break
        finally:
            stop_flag.set()
            try:
                # Only a study that ran to completion left the CLI idle enough
                # for the graceful EOF shutdown; every other exit (disconnect,
                # error, cancellation) terminates the process group promptly.
                await asyncio.to_thread(self.pn_model.close, graceful=completed)
                await asyncio.to_thread(worker.join, _WORKER_SHUTDOWN_TIMEOUT_SECONDS)
                if worker.is_alive():
                    log.error(
                        "Petrinaut optimizer worker did not stop after CLI shutdown",
                        extra={"event": "worker_join_timeout", **log_context},
                    )
            finally:
                self.lock.release()
                try:
                    study_span.set_attribute(
                        "optuna.study.best_value", self.study.best_value
                    )
                except ValueError:
                    # No trial completed (immediate disconnect, or all pruned),
                    # so there is no best value to record.
                    pass
                study_span.end()

    def run_stream(self, study: optuna.Study, objective: Any, n_trials: int) -> Any:
        """Run a study synchronously, retaining the original local-test shape."""
        events: queue.Queue[Any] = queue.Queue()
        done = object()

        def callback(_study: optuna.Study, trial: optuna.trial.FrozenTrial) -> None:
            events.put(
                (
                    str(trial.state),
                    trial.number,
                    dict(trial.params),
                    {},
                    trial.value,
                )
            )

        def run() -> None:
            study.optimize(objective, n_trials=n_trials, callbacks=[callback])
            events.put(done)

        threading.Thread(target=run, daemon=True).start()
        while (item := events.get()) is not done:
            yield item
