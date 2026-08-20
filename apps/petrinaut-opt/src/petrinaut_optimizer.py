#!/usr/bin/env python3
"""Optuna study orchestration backed by the Petrinaut optimization protocol."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import threading
from collections.abc import Callable, Mapping
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any, Literal, TypeAlias, cast

import optuna
from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.trace import Span, Status, StatusCode
from petrinaut import (
    OptimizationBooleanParameter,
    OptimizationDescribeResult,
    OptimizationFloatParameter,
    OptimizationIntParameter,
    OptimizationSession,
    PetrinautRunError,
)

from src.utils import Phase, set_status

log = logging.getLogger("pn_optimize")
tracer = trace.get_tracer("pn_optimize")
optuna.logging.set_verbosity(optuna.logging.WARNING)

SAMPLERS = {
    "tpe": optuna.samplers.TPESampler,
    "random": optuna.samplers.RandomSampler,
}
DEFAULT_STUDY_NAME = "opt_study"
# The service-side mirror of the optimization manifest's trial cap; it also
# bounds every run's in-memory event log to one frame per trial plus a
# handful of control frames, even against a study reporting a huge trial count.
MAX_STUDY_TRIALS = 1000
MAX_STUDY_SECONDS_ENVIRONMENT_VARIABLE = "HASH_PETRINAUT_OPT_MAX_STUDY_SECONDS"
DEFAULT_MAX_STUDY_SECONDS = 900.0
_DISCONNECT_POLL_SECONDS = 0.1
_WORKER_SHUTDOWN_TIMEOUT_SECONDS = 12
_SENTINEL = object()

Scalar: TypeAlias = int | float | bool
ParameterDescriptor: TypeAlias = (
    OptimizationFloatParameter | OptimizationIntParameter | OptimizationBooleanParameter
)


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


def _parse_description(
    description: OptimizationDescribeResult,
) -> tuple[
    Literal["maximize", "minimize"],
    str,
    int,
    int,
    tuple[ParameterDescriptor, ...],
]:
    """Check the semantic rules the protocol schema cannot express.

    The shape is already proven: the bindings validate every describe result
    against the CLI's published schema before this sees it. What remains are
    cross-field rules — bound ordering, log-scale domains, duplicates — and
    this service's own study limits.
    """
    sampler = description.study.sampler.value
    if sampler not in SAMPLERS:
        raise ValueError(f"unsupported Optuna sampler: {sampler!r}")
    n_trials = description.study.trials
    if n_trials > MAX_STUDY_TRIALS:
        raise ValueError(
            f"optimization.describe study.trials must not exceed {MAX_STUDY_TRIALS}"
        )
    seed = description.study.seed
    if seed < 0:
        raise ValueError(
            "optimization.describe study.seed must be a non-negative integer"
        )

    identifiers: set[str] = set()
    for parameter in description.parameters:
        identifier = parameter.identifier
        if identifier in identifiers:
            raise ValueError(f'duplicate optimization parameter "{identifier}"')
        identifiers.add(identifier)

        if isinstance(parameter, OptimizationBooleanParameter):
            continue
        if not math.isfinite(parameter.minimum) or not math.isfinite(parameter.maximum):
            raise ValueError(f"{identifier} bounds must be finite numbers")
        if parameter.minimum >= parameter.maximum:
            raise ValueError(f"{identifier}.maximum must exceed minimum")
        if parameter.scale.value == "log" and parameter.minimum <= 0:
            raise ValueError(f"{identifier}.minimum must be positive for log scale")
        if (
            isinstance(parameter, OptimizationIntParameter)
            and parameter.scale.value == "log"
            and parameter.step != 1
        ):
            raise ValueError(f"{identifier}.step must be 1 for log scale")

    return (
        description.direction.value,
        sampler,
        n_trials,
        seed,
        tuple(description.parameters),
    )


class PetrinautOptimizer:
    """Optimize the flat parameter descriptors the bindings report."""

    def __init__(
        self,
        pn_model: OptimizationSession,
        *,
        description: OptimizationDescribeResult | Mapping[str, Any] | None = None,
        **sampler_options: Any,
    ) -> None:
        raw = pn_model.describe_optimization() if description is None else description
        # Test doubles and stored payloads hand over plain mappings; a real
        # session already returns the validated model.
        described = (
            raw
            if isinstance(raw, OptimizationDescribeResult)
            else OptimizationDescribeResult.model_validate(raw)
        )
        direction, sampler_name, n_trials, seed, parameters = _parse_description(
            described
        )

        self.parameters = parameters
        self.study_name = f"{DEFAULT_STUDY_NAME}_{datetime.now(tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')}"
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
        """Ask Optuna for each non-fixed scenario parameter the study describes."""
        values: dict[str, Scalar] = {}
        for parameter in self.parameters:
            identifier = parameter.identifier
            if isinstance(parameter, OptimizationFloatParameter):
                values[identifier] = trial.suggest_float(
                    identifier,
                    parameter.minimum,
                    parameter.maximum,
                    log=parameter.scale.value == "log",
                )
            elif isinstance(parameter, OptimizationIntParameter):
                values[identifier] = trial.suggest_int(
                    identifier,
                    int(parameter.minimum),
                    int(parameter.maximum),
                    step=int(parameter.step),
                    log=parameter.scale.value == "log",
                )
            else:
                values[identifier] = trial.suggest_categorical(
                    identifier, [False, True]
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
        callback: Callable[[optuna.Study, optuna.trial.FrozenTrial], None]
        | None = None,
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
        study_callback = callback
        if study_callback is None:
            if stop_flag is None or payload_builder is None:
                raise ValueError(
                    "callback or detached-run callback inputs are required"
                )

            def emit_trial_payload(
                study: optuna.Study, trial: optuna.trial.FrozenTrial
            ) -> None:
                payload = payload_builder(study, trial)
                if payload is not None:
                    loop.call_soon_threadsafe(events.put_nowait, payload)
                if stop_flag.is_set():
                    study.stop()

            study_callback = emit_trial_payload

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
                    callbacks=[study_callback],
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

        def record_nothing(_outcome: str) -> None:
            return None

        record_outcome = on_outcome if on_outcome is not None else record_nothing
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

        worker, study_span = self._start_study_worker(
            loop, events, stop_flag, n_trials, self._trial_payload
        )
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
                    if events.empty() and worker.is_alive():
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
                    # Items are still queued — or the worker already
                    # finished and its completion sentinel is in flight — so
                    # keep draining: a study that actually finished within
                    # the limit is reported as completed.
                try:
                    item = await asyncio.wait_for(
                        events.get(), timeout=_DISCONNECT_POLL_SECONDS
                    )
                except asyncio.TimeoutError:
                    continue
                if item is _SENTINEL:
                    set_status(
                        app, run_id, phase=Phase.done, detail="optimization completed"
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
                        "Petrinaut optimizer worker did not stop after session shutdown",
                        extra={"event": "worker_join_timeout", **log_context},
                    )
            finally:
                self.lock.release()
                # No completed trial means no best value to report.
                with suppress(ValueError):
                    study_span.set_attribute(
                        "optuna.study.best_value", self.study.best_value
                    )
                study_span.end()
