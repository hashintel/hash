#!/usr/bin/env python3
"""Optuna study orchestration backed by the Petrinaut optimization protocol."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
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
# The service-side mirror of the optimization manifest's trial cap; it also
# bounds every run's in-memory event log to one frame per trial plus a
# handful of control frames, even against a CLI reporting a huge study.
MAX_STUDY_TRIALS = 1000
MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE = "HASH_PETRINAUT_OPT_MAX_STUDY_SECONDS"
DEFAULT_MAX_STUDY_SECONDS = 900.0
_DISCONNECT_POLL_SECONDS = 0.1
_WORKER_SHUTDOWN_TIMEOUT_SECONDS = 12
_SENTINEL = object()

Scalar: TypeAlias = int | float | bool
ParameterDescriptor: TypeAlias = Mapping[str, Any]


def max_study_seconds_from_environment() -> float:
    """Read the detached-study wall-clock ceiling in seconds.

    Defaults to ``DEFAULT_MAX_STUDY_SECONDS``; a value of zero or below
    disables the ceiling. Invalid and non-finite values (``inf``, ``nan``,
    overflowing literals) fall back to the default.
    """
    raw = os.environ.get(MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE, "").strip()
    if not raw:
        return DEFAULT_MAX_STUDY_SECONDS
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_MAX_STUDY_SECONDS
    if not math.isfinite(value):
        return DEFAULT_MAX_STUDY_SECONDS
    return value


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
    if n_trials > MAX_STUDY_TRIALS:
        raise ValueError(
            f"optimization.describe study.trials must not exceed {MAX_STUDY_TRIALS}"
        )
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
        loop: asyncio.AbstractEventLoop,
        events: asyncio.Queue[dict[str, Any] | object],
        stop_flag: threading.Event | None = None,
        n_trials: int | None = None,
        payload_builder: (
            Callable[[optuna.Study, optuna.trial.FrozenTrial], dict[str, Any] | None]
            | None
        ) = None,
        *,
        callback: Callable[[optuna.Study, optuna.trial.FrozenTrial], None] | None = None,
    ) -> tuple[threading.Thread, Span]:
        """Run the study on a worker thread that inherits the request's context.

        A raw ``threading.Thread`` does not inherit the caller's ``contextvars``,
        so without re-attaching the captured context every ``optimization.trial``
        span would start as a disconnected root instead of a child of the request
        span. The returned ``optimization.study`` span is the parent of those
        trial spans; the caller must ``end()`` it once the stream is torn down.
        """
        if n_trials is None:
            raise ValueError("n_trials is required")
        if callback is None:
            if stop_flag is None or payload_builder is None:
                raise ValueError("callback or detached-run callback inputs are required")

            def callback(
                study: optuna.Study, trial: optuna.trial.FrozenTrial
            ) -> None:
                payload = payload_builder(study, trial)
                if payload is not None:
                    loop.call_soon_threadsafe(events.put_nowait, payload)
                if stop_flag.is_set():
                    study.stop()

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

    @staticmethod
    def _trial_payload(
        _study: optuna.Study, trial: optuna.trial.FrozenTrial
    ) -> dict[str, Any]:
        return {
            "step": trial.number,
            "params": dict(trial.params),
            "init_state": {},
            "metric": trial.value,
            "state": trial.state.name,
        }

    async def pump_events(
        self,
        app: Any,
        run_id: str,
        n_trials: int,
        *,
        on_event: Callable[[str], Any],
        cancel_event: asyncio.Event,
        on_outcome: Callable[[str], Any] | None = None,
        correlation: Mapping[str, str | None] | None = None,
    ) -> str:
        """Run a bounded detached study and append its frames to the event log."""
        log_context = {**(correlation or {}), "run_id": run_id}
        record_outcome = on_outcome if on_outcome is not None else lambda _outcome: None
        if not self.lock.acquire(blocking=False):
            on_event('event: error\ndata: {"message": "already running"}\n\n')
            record_outcome("failed")
            return "failed"

        set_status(app, run_id, phase=Phase.running, detail="optimization running")
        log.info(
            "optimization study started",
            extra={"event": "study_started", "trials": n_trials, **log_context},
        )
        loop = asyncio.get_running_loop()
        events: asyncio.Queue[dict[str, Any] | object] = asyncio.Queue()
        stop_flag = threading.Event()

        def callback(study: optuna.Study, trial: optuna.trial.FrozenTrial) -> None:
            loop.call_soon_threadsafe(events.put_nowait, self._trial_payload(study, trial))
            if stop_flag.is_set():
                study.stop()

        started = self._start_study_worker(
            loop, events, stop_flag, n_trials, self._trial_payload
        )
        if isinstance(started, tuple):
            worker, study_span = started
        else:
            worker, study_span = started, None
        max_study_seconds = max_study_seconds_from_environment()
        study_deadline = (
            loop.time() + max_study_seconds if max_study_seconds > 0 else None
        )
        completed = False
        try:
            while True:
                if cancel_event.is_set():
                    stop_flag.set()
                    log.info(
                        "optimization run cancelled, stopping study",
                        extra={"event": "study_cancelled", **log_context},
                    )
                    record_outcome("cancelled")
                    return "cancelled"
                if study_deadline is not None and loop.time() >= study_deadline:
                    stop_flag.set()
                    if events.empty():
                        message = (
                            "optimization study exceeded its "
                            f"{max_study_seconds:g} second execution limit"
                        )
                        set_status(app, run_id, phase=Phase.error, detail=message)
                        log.warning(
                            "optimization study timed out",
                            extra={
                                "event": "study_timeout",
                                "max_study_seconds": max_study_seconds,
                                "trials": n_trials,
                                **log_context,
                            },
                        )
                        payload = {"state": "ERROR", "message": message}
                        on_event(f"data: {json.dumps(payload)}\n\n")
                        record_outcome("failed")
                        return "failed"
                    # Items are still queued — possibly the completion
                    # sentinel — so keep draining: a study that actually
                    # finished within the limit is reported as completed.
                try:
                    item = await asyncio.wait_for(
                        events.get(), timeout=_DISCONNECT_POLL_SECONDS
                    )
                except asyncio.TimeoutError:
                    continue
                if item is _SENTINEL:
                    set_status(app, run_id, phase=Phase.done, detail="optimization completed")
                    completed = True
                    log.info(
                        "optimization study completed",
                        extra={"event": "study_completed", "trials": n_trials, **log_context},
                    )
                    on_event("event: done\ndata: {}\n\n")
                    record_outcome("completed")
                    return "completed"
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
                        extra={"event": "study_failed", **log_context},
                    )
                    on_event(f"data: {json.dumps(event)}\n\n")
                    record_outcome("failed")
                    return "failed"
                on_event(f"data: {json.dumps(event)}\n\n")
        finally:
            stop_flag.set()
            try:
                await asyncio.to_thread(self.pn_model.close, graceful=completed)
                await asyncio.to_thread(worker.join, _WORKER_SHUTDOWN_TIMEOUT_SECONDS)
                if worker.is_alive():
                    log.error(
                        "Petrinaut optimizer worker did not stop after CLI shutdown",
                        extra={"event": "worker_join_timeout", **log_context},
                    )
            finally:
                self.lock.release()
                if study_span is not None:
                    try:
                        study_span.set_attribute(
                            "optuna.study.best_value", self.study.best_value
                        )
                    except ValueError:
                        pass
                    study_span.end()

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
            loop, events, n_trials=n_trials, callback=callback
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
            loop, events, n_trials=n_trials, callback=callback
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
