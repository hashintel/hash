#!/usr/bin/env python3
"""Black-box optimization of a CLI Petrinaut execution via Optuna.

ASSUMPTION: Petri-net used is ../libs/@hashintel/petrinaut-cli/examples/supply-chain-profit-model.json

Wraps a command-line program that prints a single numeric objective to stdout.
`PetrinautOptimizer` proposes inputs, invokes the CLI, parses the result, and
reports it back to Optuna — maximising (or minimising) the output.

Configure the DEFAULT_* constants below (or pass overrides to the constructor),
then either run this file directly for a one-off run, or instantiate
`PetrinautOptimizer` from another module (see optimization_api.py).
"""

from __future__ import annotations

import logging
import sys
import queue
import json
import threading
import asyncio

from enum import Enum
from datetime import datetime
from dataclasses import dataclass
from typing import Generic, TypeVar, Literal, Any
from pydantic import BaseModel, Field, model_validator
from fastapi import Request

import optuna

optuna.logging.set_verbosity(optuna.logging.WARNING)

from src.utils import Phase, set_status
from src.petrinaut_client import PetrinautModel,PetrinautModelSpec

log = logging.getLogger("pn_optimize")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — defaults for the optimizer specification; override via constructor args.
# ─────────────────────────────────────────────────────────────────────────────

# Search space comprising of parameters and initial state. One entry per optimizable input.
#   name : Optuna param name and (by default) flag name; 
#   type : "float" | "int" 
#   float/int: low, high (+ optional step, log=True); categorical: choices=[...]

# Specification of all parameters
T = TypeVar("T", int, float)
BoundKind = Literal["int", "float"]

@dataclass(frozen=True)
class Bounds(Generic[T]):
    low: T
    high: T
    kind: BoundKind
    log: bool = False

def IntBounds(low: int, high: int, *, log: bool = False) -> Bounds[int]:
    """Construct integer-valued search bounds.

    Args:
        low (int): Inclusive lower bound.
        high (int): Inclusive upper bound.
        log (bool): Sample on a log scale. Defaults to False.

    Returns:
        Bounds[int]: Integer bounds descriptor.
    """
    return Bounds(low, high, "int", log)

def FloatBounds(
    low: float,
    high: float,
    *,
    log: bool = False,
) -> Bounds[float]:
    """Construct float-valued search bounds.

    Args:
        low (float): Inclusive lower bound.
        high (float): Inclusive upper bound.
        log (bool): Sample on a log scale. Defaults to False.

    Returns:
        Bounds[float]: Float bounds descriptor.
    """
    return Bounds(low, high, "float", log)

BOUNDS: dict[str, dict[str, Bounds[int] | Bounds[float]]] = {
    "parameters": {
        "production_rate": FloatBounds(20.0, 250.0, log=True),
        "reorder_threshold": IntBounds(100, 1000, log=True),
        "batch_size": IntBounds(50, 800, log=True),
        "selling_price": FloatBounds(22.0, 60.0, log=True),
        "expedite_fraction": FloatBounds(0.0, 1.0),
        "marketing_spend": FloatBounds(0.01, 100.0, log=True),
        "demand_multiplier": FloatBounds(0.5, 2.0),
    },
    "initial_state": {
        "RawInventory": IntBounds(0, 400),
        "FinishedGoods": IntBounds(0, 400),
        "CustomerDemand": IntBounds(0, 400),
        "SoldOrders": IntBounds(0, 400),
        "LostSales": IntBounds(0, 400),
    },
}

class Parameters(BaseModel):
    production_rate: float | None = None # default 100.0
    reorder_threshold: int | None = None # default 160
    batch_size: int | None = None # default 180
    selling_price: float | None = None # default 34.0
    expedite_fraction: float | None = None # default 0.25
    marketing_spend: float | None = None # default 20.0
    demand_multiplier: float | None = None # default 1.0

class InitialStates(BaseModel):
    RawInventory: int | None = None # default 220
    FinishedGoods: int | None = None # default 120
    CustomerDemand: int | None = None # default 0
    SoldOrders: int | None = None # default 0
    LostSales: int | None = None # default 0
    # FinancialData: Any | None = None # default is created upon initialisation of PetrinautModel class


# Hard-coded allowable optuna samplers 
SAMPLERS = {
    "tpe": optuna.samplers.TPESampler,
    "random": optuna.samplers.RandomSampler,
}
# Enum for optuna sampler name
SamplerName = Enum(
    "SamplerName",
    {name.upper(): name for name in SAMPLERS},
    type=str,
)
# optuna study name prefix
DEFAULT_STUDY_NAME = "opt_study"
# input space sampling algorithm - default: Tree-structured Parzen Estimator
DEFAULT_SAMPLER = "tpe"
# maximise the CLI's output
DEFAULT_DIRECTION = "maximize"
# evaluations per run
DEFAULT_N_TRIALS = 100


class OptimizationSpec(BaseModel):
    parameters: Parameters = Parameters()
    initial_state: InitialStates = InitialStates()
    study_name: str = Field(default=DEFAULT_STUDY_NAME, description="Name of optimization study")
    sampler: SamplerName = Field(default=DEFAULT_SAMPLER, description="input sampling algorithm")
    direction: Literal["maximize", "minimize"] = Field(default=DEFAULT_DIRECTION, description="optimization direction")
    n_trials: int = Field(default=DEFAULT_N_TRIALS, description="number of evals to run")

    def fixed(self) -> dict[str, dict[str, float]]:
        """Collect the inputs pinned to a value (those left `None` are optimized).

        Returns:
            dict[str, dict[str, float]]: Fixed values keyed by group ("parameters", "initial_state").
        """
        out: dict[str, dict[str, float]] = {}
        for group_name in ("parameters", "initial_state"):
            group = getattr(self, group_name)
            out[group_name] = {
                name: value for name, value in group if value is not None
            }
        return out

    @model_validator(mode="after")
    def _check_bounds(self):
        """Validate that every fixed input falls within its allowed `BOUNDS` range.

        Raises:
            ValueError: A fixed value lies outside its bound.

        Returns:
            OptimizationSpec: The validated spec.
        """
        for group_name, fields in self.fixed().items():
            for name, value in fields.items():
                b = BOUNDS[group_name][name]
                if not (b.low <= value <= b.high):
                    raise ValueError(
                        f"{group_name}.{name}={value} outside "
                        f"allowed range [{b.low}, {b.high}]"
                    )
        return self

# ─────────────────────────────────────────────────────────────────────────────
# OptimizationModel
# ─────────────────────────────────────────────────────────────────────────────
_SENTINEL = object()


class PetrinautOptimizer:
    """Optimize a Petrinaut CLI's stdout objective over a mixed input space."""

    def __init__(
        self,
        opt_spec: OptimizationSpec,
        pn_model: PetrinautModel,
        **kwargs
    ) -> None:
        """Build the Optuna study and bind the Petrinaut model for this run.

        Args:
            opt_spec (OptimizationSpec): Which inputs to optimize/fix, sampler, direction, and trial count.
            pn_model (PetrinautModel): Wrapper that executes the Petri net per trial.
            **kwargs: Forwarded to the selected Optuna sampler constructor.
        """
        self.fixed = opt_spec.fixed()
        self.params = opt_spec.parameters
        self.init_state = opt_spec.initial_state
        self.study_name = f"{opt_spec.study_name}_{datetime.now().strftime('%m/%d/%Y-%H:%M:%S')}"
        self.sampler = SAMPLERS[opt_spec.sampler.lower()](seed=pn_model.seed,**kwargs)
        self.direction = opt_spec.direction
        self.n_trials = opt_spec.n_trials
        self.study = optuna.create_study(
            study_name=self.study_name,
            storage=None,
            load_if_exists=False,
            direction=self.direction,
            sampler=self.sampler,
        )
        # Petrinaut model (Python wrapper)
        self.pn_model = pn_model
        # A lock so the same instance is never driven by two concurrent streams.
        self.lock = threading.Lock()

    # ── search space ─────────────────────────────────────────────────────────
    def suggest(self, trial: optuna.Trial) -> dict[str, dict[str, float]]:
        """Assemble one trial's inputs, asking Optuna for each non-fixed value.

        Args:
            trial (optuna.Trial): The Optuna trial proposing new values.

        Raises:
            Exception: A bound is neither an int nor a float kind.

        Returns:
            dict[str, dict[str, float]]: Suggested values keyed by group ("parameters", "initial_state").
        """
        values: dict[str, dict[str, float]] = {}
        for group_name, fields in BOUNDS.items():
            values[group_name] = {}
            for name, b in fields.items():
                if name in self.fixed[group_name]:
                    values[group_name][name] = self.fixed[group_name][name]
                else:
                    b = BOUNDS[group_name][name]
                    if b.kind == "int":
                        values[group_name][name] = trial.suggest_int(
                            f"{group_name}.{name}", b.low, b.high, log=b.log
                        )
                    elif b.kind == "float":
                        values[group_name][name] = trial.suggest_float(
                            f"{group_name}.{name}", b.low, b.high, log=b.log
                        )
                    else:
                        raise Exception(f"{group_name}.{name} is not of type IntBounds or FloatBounds")
        return values


    def objective(self, trial: optuna.Trial) -> float:
        """One evaluation: suggest inputs, run the Petrinaut CLI, parse the result.

        Args:
            trial (optuna.Trial): Single evaluation of objective function

        Raises:
            optuna.TrialPruned: Early stopping optimization due to timeout
            optuna.TrialPruned: Early stopping optimization due to process error

        Returns:
            float: Evaluation of metric from Petrinaut execution
        """
        # Suggest new set of params and init states
        # while keeping fixed parameters fixed
        params_and_init_state = self.suggest(trial)
        params = params_and_init_state["parameters"]
        init_state = params_and_init_state["initial_state"]

        try:
            # Build and invoke the Petrinaut CLI command 
            value = self.pn_model.objective(
                parameters=params,
                initial_state=init_state
            )
        except RuntimeError as r:
            # This happens in case the Petrinaut execution takes too long to run 
            # as defined by the eval_timeout parameter in the PetrinautModelSpec
            log.warning("trial %d runtime error %s — pruned", trial.number, str(r))
            raise optuna.TrialPruned()
        except Exception as e:
            # If Petrinaut execution fails for whatever other reason
            # optuna prunes that run and continues the optimization
            log.warning(
                "trial %d failed — pruned\nstderr: %s",
                trial.number, str(e),
            )
            raise optuna.TrialPruned()

        # Log results
        log.info("trial %d  value=%.6g  params=%s  init_state=%s", trial.number, value, params, init_state)

        return value

    # ── runs for API ─────────────────────────────────────────────────────────────────
    async def stream_all(self, request: Request, run_id: str, n_trials: int):
        """Async generator yielding Server-side event frames, one per finished trial.

        Args:
            request (Request): Optimization API generic request
            run_id (str): Identifier of the optimization run being streamed.
            n_trials (int): number of optimization steps

        Yields:
            str: An SSE frame — a `data:` line per finished trial, then a final `event: done` frame.
        """
        app = request.app
        if not self.lock.acquire(blocking=False):
            yield 'event: error\ndata: {"message": "already running"}\n\n'
            return
        
        set_status(app, run_id, phase=Phase.running, detail="optimization running")
    
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        stop_flag = threading.Event()

        # Callback for generating the payload from optuna optimize worker
        def callback(study, trial):
            """Queue the finished trial's SSE payload; honour a pending stop request."""
            params_and_init_state = {}
            for k, v in trial.params.items():
                outer, inner = k.split('.', 1)
                params_and_init_state.setdefault(outer, {})[inner] = v
            payload = {
                "step": trial.number,
                "params": params_and_init_state.get("parameters",dict()),
                "init_state": params_and_init_state.get("initial_state",dict()),
                "metric": trial.value,
                "state": trial.state.name,
            }
            # Pass payload to streamer
            loop.call_soon_threadsafe(q.put_nowait, payload)
            if stop_flag.is_set():
                study.stop()

        # Running the optuna optimize worker
        def run():
            """Run the Optuna study on a worker thread, funnelling results/errors to the queue."""
            try:
                self.study.optimize(
                    self.objective, n_trials=n_trials, callbacks=[callback]
                )
            except Exception as exc:
                # Pass error to streamer
                loop.call_soon_threadsafe(
                    q.put_nowait, {"state": "ERROR", "message": str(exc)}
                )
            finally:
                # Pass error to streamer
                loop.call_soon_threadsafe(q.put_nowait, _SENTINEL)

        worker = threading.Thread(target=run, daemon=True)
        worker.start()

        try:
            while True:
                item = await q.get()
                if item is _SENTINEL:
                    set_status(
                        app,
                        run_id,
                        phase=Phase.done,
                        detail="optimization completed",
                    )
                    yield "event: done\ndata: {}\n\n"
                    break
                if item.get("state") == "ERROR":
                    set_status(app, run_id, phase=Phase.error, detail=item.get("message"))
                    yield f"data: {json.dumps(item)}\n\n"
                    continue
                yield f"data: {json.dumps(item)}\n\n"
                if await request.is_disconnected():
                    stop_flag.set()
                    set_status(
                        app,
                        run_id,
                        phase=Phase.idle,
                        detail="client disconnected, stopped",
                    )
                    break
        finally:
            # Signal the study to stop, then wait for the worker to actually exit before
            # closing the CLI — otherwise close() can tear down the subprocess while a
            # trial is still mid-request. Join off the event loop so other requests keep
            # serving. stop_flag only takes effect at the next trial boundary, so this
            # waits out at most one in-flight evaluation.
            stop_flag.set()
            try:
                if self.pn_model.eval_timeout:
                    await loop.run_in_executor(None, worker.join(self.pn_model.eval_timeout))
                else:
                    await loop.run_in_executor(None, worker.join)
            finally:
                self.lock.release()
                self.pn_model.close()

    async def stream_best(self, request: Request, run_id: str, n_trials: int):
        """Async generator yielding Server-side event frames, one per finished trial.

        Args:
            request (Request): Optimization API generic request
            run_id (str): Identifier of the optimization run being streamed.
            n_trials (int): number of optimization steps

        Yields:
            str: An SSE frame — a `data:` line per finished trial, then a final `event: done` frame.
        """
        app = request.app
        if not self.lock.acquire(blocking=False):
            yield 'event: error\ndata: {"message": "already running"}\n\n'
            return

        set_status(app, run_id, phase=Phase.running, detail="optimization running")

        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        stop_flag = threading.Event()

        # Callback for generating the payload from optuna optimize worker
        def callback(study, trial):
            """Queue the best-so-far SSE payload once a trial completes; honour a pending stop."""
            # `best_params`/`best_value` raise if no trial has completed yet (e.g.
            # the opening trials were all pruned). Skip emitting until there is a
            # best to report, but still honour a pending stop request.
            has_completed = any(
                t.state == optuna.trial.TrialState.COMPLETE
                for t in study.get_trials(deepcopy=False)
            )
            if not has_completed:
                if stop_flag.is_set():
                    study.stop()
                return

            best_params_and_init_state = {}
            for k, v in study.best_params.items():
                outer, inner = k.split('.', 1)
                best_params_and_init_state.setdefault(outer, {})[inner] = v
            payload = {
                "step": trial.number,
                "params": best_params_and_init_state.get("parameters",dict()),
                "init_state": best_params_and_init_state.get("initial_state",dict()),
                "metric": study.best_value,
                "state": "COMPLETE",
            }
            # Pass payload to streamer
            loop.call_soon_threadsafe(q.put_nowait, payload)
            if stop_flag.is_set():
                study.stop()

        # Running the optuna optimize worker
        def run():
            """Run the Optuna study on a worker thread, funnelling results/errors to the queue."""
            try:
                self.study.optimize(
                    self.objective, n_trials=n_trials, callbacks=[callback]
                )
            except Exception as exc:
                # Pass error to streamer
                loop.call_soon_threadsafe(
                    q.put_nowait, {"state": "ERROR", "message": str(exc)}
                )
            finally:
                # Pass error to streamer
                loop.call_soon_threadsafe(q.put_nowait, _SENTINEL)

        worker = threading.Thread(target=run, daemon=True)
        worker.start()
 
        try:
            while True:
                item = await q.get()
                if item is _SENTINEL:
                    set_status(
                        app,
                        run_id,
                        phase=Phase.done,
                        detail="optimization completed",
                    )
                    yield "event: done\ndata: {}\n\n"
                    break
                if item.get("state") == "ERROR":
                    set_status(app, run_id, phase=Phase.error, detail=item.get("message"))
                    yield f"data: {json.dumps(item)}\n\n"
                    continue
                yield f"data: {json.dumps(item)}\n\n"
                if await request.is_disconnected():
                    stop_flag.set()
                    set_status(
                        app,
                        run_id,
                        phase=Phase.idle,
                        detail="client disconnected, stopped",
                    )
                    break
        finally:
            # Signal the study to stop, then wait for the worker to actually exit before
            # closing the CLI — otherwise close() can tear down the subprocess while a
            # trial is still mid-request. Join off the event loop so other requests keep
            # serving. stop_flag only takes effect at the next trial boundary, so this
            # waits out at most one in-flight evaluation.
            stop_flag.set()
            try:
                if self.pn_model.eval_timeout:
                    await loop.run_in_executor(None, worker.join(self.pn_model.eval_timeout))
                else:
                    await loop.run_in_executor(None, worker.join)
            finally:
                self.lock.release()
                self.pn_model.close()
    
    # ── run for local testing /printing ─────────────────────────────────────────────────────────────────
    def run_stream(self, study, objective, n_trials):
        """Run a study synchronously, yielding each finished trial (for local testing).

        Args:
            study (optuna.Study): The Optuna study to optimize.
            objective (Callable): The objective callable evaluated per trial.
            n_trials (int): Number of trials to run.

        Yields:
            tuple: (state, trial number, parameters, initial state, metric value) per trial.
        """
        q = queue.Queue()
        _DONE = object()

        def callback(study, trial):
            """Enqueue a tuple describing each finished trial."""
            params_and_init_state = {}
            for k, v in trial.params.items():
                outer, inner = k.split('.', 1)
                params_and_init_state.setdefault(outer, {})[inner] = v
            q.put((
                str(trial.state),
                trial.number,
                params_and_init_state.get("parameters", dict()),
                params_and_init_state.get("initial_state", dict()),
                trial.value
            ))

        def run():
            """Optimize the study then enqueue the completion sentinel."""
            study.optimize(objective, n_trials=n_trials, callbacks=[callback])
            q.put(_DONE)

        threading.Thread(target=run, daemon=True).start()
        while (item := q.get()) is not _DONE:
            yield item

# ─────────────────────────────────────────────────────────────────────────────
# Main function for testing the script
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    """Main method for testing the optimizer
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(message)s",
        datefmt="%H:%M:%S",
    )
        
    pn_spec = PetrinautModelSpec()
    opt_spec = OptimizationSpec(
        n_trials = 1000,
        parameters = {
            "selling_price":34.0,
            "expedite_fraction":0.25,
            "marketing_spend":20.0,
            "demand_multiplier":1.0,
        },
        initial_state = {
            "RawInventory": 220,
            "FinishedGoods": 120,
            "CustomerDemand": 0,
            "SoldOrders": 0,
            "LostSales": 0,
        }
    )
    # Create the petrinaut execution specification
    pn_spec = PetrinautModelSpec()
    # Build the Petri net from the client spec in a context manager
    with PetrinautModel(pn_spec) as petrinet_model:
        # Instantiate Petrinaut optimization class
        optimizer = PetrinautOptimizer(
            opt_spec = opt_spec,
            pn_model = petrinet_model
        )
        # Run optimization steps
        for state, step, params, init_state, metric_value in optimizer.run_stream(
            optimizer.study, 
            optimizer.objective, 
            optimizer.n_trials
        ):
            a = 0
            # log.info(json.dumps({"state":state,"step":step,"params":params,"init_state":init_state,"metric":metric_value},indent=2))

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        sys.exit(130)
