"""Optuna study orchestration backed by the Petrinaut optimization protocol."""

import asyncio
import logging
import queue
import threading
from collections.abc import AsyncIterator, Callable, Iterator, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum, auto
from typing import Annotated, Literal, Protocol, Self

import optuna
from fastapi import FastAPI
from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.trace import Span, Status, StatusCode
from pydantic import BaseModel, Discriminator, Field, JsonValue, Tag, model_validator

from src.petrinaut_client import PetrinautRunError, Scalar
from src.utils import Phase, set_status

log = logging.getLogger("pn_optimize")
tracer = trace.get_tracer("pn_optimize")
optuna.logging.set_verbosity(optuna.logging.WARNING)

DEFAULT_STUDY_NAME = "opt_study"
SSE_HEARTBEAT_SECONDS = 30
_DISCONNECT_POLL_SECONDS = 0.1
_WORKER_SHUTDOWN_TIMEOUT_SECONDS = 12

type SamplerName = Literal["tpe", "random"]

SAMPLERS: Mapping[SamplerName, Callable[[int], optuna.samplers.BaseSampler]] = {
    "tpe": lambda seed: optuna.samplers.TPESampler(seed=seed),
    "random": lambda seed: optuna.samplers.RandomSampler(seed=seed),
}

type _StrictFinite = Annotated[float, Field(strict=True, allow_inf_nan=False)]
type _StrictInt = Annotated[int, Field(strict=True)]


class FloatParameter(BaseModel):
    """One continuous scenario parameter described by the CLI."""

    identifier: str = Field(min_length=1)
    type: Literal["float"]
    minimum: _StrictFinite
    maximum: _StrictFinite
    scale: Literal["linear", "log"]

    @model_validator(mode="after")
    def _check_bounds(self) -> Self:
        if self.minimum >= self.maximum:
            raise ValueError(f"{self.identifier}.maximum must exceed minimum")
        if self.scale == "log" and self.minimum <= 0:
            raise ValueError(f"{self.identifier}.minimum must be positive for log scale")

        return self


class IntParameter(BaseModel):
    """One integer scenario parameter described by the CLI."""

    identifier: str = Field(min_length=1)
    type: Literal["int"]
    minimum: _StrictInt
    maximum: _StrictInt
    step: Annotated[int, Field(strict=True, ge=1)]
    scale: Literal["linear", "log"]

    @model_validator(mode="after")
    def _check_bounds(self) -> Self:
        if self.minimum >= self.maximum:
            raise ValueError(f"{self.identifier}.maximum must exceed minimum")
        if self.scale == "log" and self.minimum <= 0:
            raise ValueError(f"{self.identifier}.minimum must be positive for log scale")
        if self.scale == "log" and self.step != 1:
            raise ValueError(f"{self.identifier}.step must be 1 for log scale")

        return self


class BooleanParameter(BaseModel):
    """One boolean scenario parameter described by the CLI."""

    identifier: str = Field(min_length=1)
    type: Literal["boolean"]


def _parameter_tag(value: object) -> str | None:
    """Extract the ``type`` union tag during validation and serialization.

    A callable discriminator sees the *raw* input: a mapping when validating
    CLI JSON, an existing model instance otherwise. Returning ``None`` for
    anything else lets pydantic report a proper ``union_tag_not_found``
    validation error instead of an ``AttributeError``.
    """
    tag = value.get("type") if isinstance(value, Mapping) else getattr(value, "type", None)
    return tag if isinstance(tag, str) else None


type ParameterDescriptor = Annotated[
    Annotated[FloatParameter, Tag("float")]
    | Annotated[IntParameter, Tag("int")]
    | Annotated[BooleanParameter, Tag("boolean")],
    Discriminator(_parameter_tag),
]


class StudySettings(BaseModel):
    """The Optuna study configuration owned by the CLI."""

    sampler: SamplerName
    trials: Annotated[int, Field(strict=True, ge=1)]
    seed: Annotated[int, Field(strict=True, ge=0)]


class OptimizationDescription(BaseModel):
    """The small, generic ``optimization.describe`` protocol contract."""

    direction: Literal["maximize", "minimize"]
    study: StudySettings
    parameters: tuple[ParameterDescriptor, ...]

    @model_validator(mode="after")
    def _check_unique_identifiers(self) -> Self:
        identifiers: set[str] = set()
        for parameter in self.parameters:
            if parameter.identifier in identifiers:
                raise ValueError(f'duplicate optimization parameter "{parameter.identifier}"')
            identifiers.add(parameter.identifier)

        return self


class OptimizationModel(Protocol):
    """The CLI adapter surface the optimizer drives; a seam for test fakes."""

    def describe_optimization(self) -> Mapping[str, JsonValue]: ...

    def objective(self, parameter_values: Mapping[str, Scalar], /) -> float: ...

    def close(self, *, graceful: bool = ...) -> None: ...


class StreamRequest(Protocol):
    """The slice of ``fastapi.Request`` the SSE streams observe."""

    @property
    def app(self) -> FastAPI: ...

    @property
    def headers(self) -> Mapping[str, str]: ...

    async def is_disconnected(self) -> bool: ...


class TrialFrame(BaseModel):
    """One per-trial SSE data frame in the shape Yannis's client expects."""

    step: int
    params: dict[str, JsonValue]
    init_state: dict[str, JsonValue] = Field(default_factory=dict)
    metric: float | None
    state: str


class ErrorFrame(BaseModel):
    """The terminal SSE data frame reporting a failed study."""

    state: Literal["ERROR"] = "ERROR"
    message: str


class _StreamSignal(Enum):
    """Terminal marker the worker thread posts once the study has ended."""

    DONE = auto()


type _StreamEvent = TrialFrame | ErrorFrame | _StreamSignal

type _FrameBuilder = Callable[[optuna.Study, optuna.trial.FrozenTrial], TrialFrame | None]
"""Convert one completed trial into the next frame to stream, if any."""


def _every_trial_frame(_study: optuna.Study, trial: optuna.trial.FrozenTrial) -> TrialFrame:
    return TrialFrame(
        step=trial.number,
        params=dict(trial.params),
        metric=trial.value,
        state=trial.state.name,
    )


def _best_so_far_frame(study: optuna.Study, trial: optuna.trial.FrozenTrial) -> TrialFrame | None:
    has_completed = any(
        candidate.state is optuna.trial.TrialState.COMPLETE
        for candidate in study.get_trials(deepcopy=False)
    )
    if not has_completed:
        return None
    return TrialFrame(
        step=trial.number,
        params=dict(study.best_params),
        metric=study.best_value,
        state="COMPLETE",
    )


@dataclass(slots=True)
class _StreamState:
    """Outcome shared between the frame loop and the teardown path."""

    completed: bool = False
    log_context: dict[str, str | None] = field(default_factory=dict)


class PetrinautOptimizer:
    """Optimize the flat parameter descriptors supplied by Petrinaut CLI."""

    def __init__(
        self,
        pn_model: OptimizationModel,
        *,
        description: Mapping[str, JsonValue] | None = None,
    ) -> None:
        parsed = OptimizationDescription.model_validate(
            pn_model.describe_optimization() if description is None else description
        )

        self.parameters = parsed.parameters
        started_at = datetime.now(tz=UTC).strftime("%m/%d/%Y-%H:%M:%S")
        self.study_name = f"{DEFAULT_STUDY_NAME}_{started_at}"
        self.sampler = SAMPLERS[parsed.study.sampler](parsed.study.seed)
        self.direction: Literal["maximize", "minimize"] = parsed.direction
        self.n_trials = parsed.study.trials
        self.study = optuna.create_study(
            study_name=self.study_name,
            storage=None,
            load_if_exists=False,
            direction=self.direction,
            sampler=self.sampler,
        )
        self.pn_model = pn_model
        self.lock = threading.Lock()

    def suggest(self, trial: optuna.trial.BaseTrial) -> dict[str, Scalar]:
        """Ask Optuna for each non-fixed scenario parameter described by the CLI."""
        values: dict[str, Scalar] = {}

        for parameter in self.parameters:
            match parameter:
                case FloatParameter():
                    values[parameter.identifier] = trial.suggest_float(
                        parameter.identifier,
                        parameter.minimum,
                        parameter.maximum,
                        log=parameter.scale == "log",
                    )
                case IntParameter():
                    values[parameter.identifier] = trial.suggest_int(
                        parameter.identifier,
                        parameter.minimum,
                        parameter.maximum,
                        step=parameter.step,
                        log=parameter.scale == "log",
                    )
                case BooleanParameter():
                    values[parameter.identifier] = trial.suggest_categorical(
                        parameter.identifier, [False, True]
                    )

        return values

    def objective(self, trial: optuna.trial.BaseTrial) -> float:
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
                span.set_attribute("optuna.trial.pruned", value=True)
                log.warning(
                    "trial %d failed — pruned",
                    trial.number,
                    extra={"error_type": type(error).__name__},
                )
                prune_cause = error
            else:
                span.set_attribute("optuna.trial.value", value)
                return value

        raise optuna.TrialPruned from prune_cause

    def _start_study_worker(
        self,
        *,
        n_trials: int,
        callback: Callable[[optuna.Study, optuna.trial.FrozenTrial], None],
        events: asyncio.Queue[_StreamEvent],
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
            except Exception as error:  # noqa: BLE001 — thread boundary: any failure must become a terminal SSE frame instead of dying silently.
                study_span.record_exception(error)
                study_span.set_status(Status(StatusCode.ERROR))
                loop.call_soon_threadsafe(
                    events.put_nowait,
                    ErrorFrame(message=str(error)),
                )
            finally:
                otel_context.detach(token)
                loop.call_soon_threadsafe(events.put_nowait, _StreamSignal.DONE)

        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        return worker, study_span

    def stream_all(self, request: StreamRequest, run_id: str, n_trials: int) -> AsyncIterator[str]:
        """Stream Yannis's per-trial SSE frames, followed by the done frame."""
        return self._stream_study(request, run_id, n_trials, frame_builder=_every_trial_frame)

    def stream_best(self, request: StreamRequest, run_id: str, n_trials: int) -> AsyncIterator[str]:
        """Stream Yannis's best-so-far SSE frames, followed by the done frame."""
        return self._stream_study(request, run_id, n_trials, frame_builder=_best_so_far_frame)

    async def _stream_study(
        self,
        request: StreamRequest,
        run_id: str,
        n_trials: int,
        *,
        frame_builder: _FrameBuilder,
    ) -> AsyncIterator[str]:
        """Run one study and stream its SSE frames until a terminal event."""
        app = request.app
        state = _StreamState(
            log_context={
                "request_id": request.headers.get("x-hash-request-id"),
                "run_id": run_id,
            }
        )
        if not self.lock.acquire(blocking=False):
            yield 'event: error\ndata: {"message": "already running"}\n\n'
            return

        set_status(app, run_id, phase=Phase.running, detail="optimization running")
        log.info(
            "optimization study started",
            extra={"event": "study_started", "trials": n_trials, **state.log_context},
        )
        loop = asyncio.get_running_loop()
        events: asyncio.Queue[_StreamEvent] = asyncio.Queue()
        stop_flag = threading.Event()

        def callback(study: optuna.Study, trial: optuna.trial.FrozenTrial) -> None:
            frame = frame_builder(study, trial)
            if frame is not None:
                loop.call_soon_threadsafe(events.put_nowait, frame)
            if stop_flag.is_set():
                study.stop()

        worker, study_span = self._start_study_worker(
            n_trials=n_trials, callback=callback, events=events, loop=loop
        )

        try:
            async for frame in self._stream_frames(
                request, run_id, n_trials=n_trials, events=events, state=state
            ):
                yield frame

        finally:
            stop_flag.set()
            try:
                # Only a study that ran to completion left the CLI idle enough
                # for the graceful EOF shutdown; every other exit (disconnect,
                # error, cancellation) terminates the process group promptly.
                await asyncio.to_thread(self.pn_model.close, graceful=state.completed)
                await asyncio.to_thread(worker.join, _WORKER_SHUTDOWN_TIMEOUT_SECONDS)
                if worker.is_alive():
                    log.error(
                        "Petrinaut optimizer worker did not stop after CLI shutdown",
                        extra={"event": "worker_join_timeout", **state.log_context},
                    )
            finally:
                self.lock.release()
                self._finish_study_span(study_span)

    @staticmethod
    async def _stream_frames(
        request: StreamRequest,
        run_id: str,
        *,
        n_trials: int,
        events: asyncio.Queue[_StreamEvent],
        state: _StreamState,
    ) -> AsyncIterator[str]:
        """Yield SSE frames and heartbeats until the study reaches a terminal event."""
        app = request.app
        loop = asyncio.get_running_loop()
        next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
        while True:
            if await request.is_disconnected():
                set_status(
                    app,
                    run_id,
                    phase=Phase.idle,
                    detail="client disconnected, stopped",
                )
                log.info(
                    "client disconnected, stopping optimization study",
                    extra={"event": "client_disconnected", **state.log_context},
                )
                return

            heartbeat_wait = max(0.0, next_heartbeat - loop.time())
            try:
                item = await asyncio.wait_for(
                    events.get(),
                    timeout=min(_DISCONNECT_POLL_SECONDS, heartbeat_wait),
                )
            except TimeoutError:
                if loop.time() >= next_heartbeat:
                    yield ": heartbeat\n\n"
                    next_heartbeat = loop.time() + SSE_HEARTBEAT_SECONDS
                continue

            match item:
                case _StreamSignal.DONE:
                    state.completed = True
                    set_status(app, run_id, phase=Phase.done, detail="optimization completed")
                    log.info(
                        "optimization study completed",
                        extra={
                            "event": "study_completed",
                            "trials": n_trials,
                            **state.log_context,
                        },
                    )
                    yield "event: done\ndata: {}\n\n"
                    return
                case ErrorFrame():
                    set_status(app, run_id, phase=Phase.error, detail=item.message)
                    log.warning(
                        "optimization study failed",
                        extra={"event": "study_failed", **state.log_context},
                    )
                    yield f"data: {item.model_dump_json()}\n\n"
                    return
                case TrialFrame():
                    yield f"data: {item.model_dump_json()}\n\n"

    def _finish_study_span(self, study_span: Span) -> None:
        try:
            study_span.set_attribute("optuna.study.best_value", self.study.best_value)
        except ValueError:
            # No trial completed (immediate disconnect, or all pruned),
            # so there is no best value to record.
            pass
        finally:
            study_span.end()

    @staticmethod
    def run_stream(
        study: optuna.Study,
        objective: Callable[[optuna.Trial], float],
        n_trials: int,
    ) -> Iterator[tuple[str, int, dict[str, JsonValue], dict[str, JsonValue], float | None]]:
        """Run a study synchronously, retaining the original local-test shape."""
        events: queue.Queue[
            tuple[str, int, dict[str, JsonValue], dict[str, JsonValue], float | None]
            | _StreamSignal
        ] = queue.Queue()

        def callback(_study: optuna.Study, trial: optuna.trial.FrozenTrial) -> None:
            events.put((
                str(trial.state),
                trial.number,
                dict(trial.params),
                {},
                trial.value,
            ))

        def run() -> None:
            study.optimize(objective, n_trials=n_trials, callbacks=[callback])
            events.put(_StreamSignal.DONE)

        threading.Thread(target=run, daemon=True).start()
        while (item := events.get()) is not _StreamSignal.DONE:
            yield item
