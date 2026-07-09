#!/usr/bin/env python3
"""Black-box optimization of a CLI Petrinaut execution via Optuna.

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
from typing import Annotated, Optional, Sequence, Literal, Union
from pydantic import BaseModel, Field, model_validator
from fastapi import Request

import optuna

from src.petrinaut_client import PetrinautModel,PetrinautModelSpec

log = logging.getLogger("pn_optimize")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — defaults for the optimizer specification; override via constructor args.
# ─────────────────────────────────────────────────────────────────────────────

# Search space comprising of parameters and initial state. One entry per optimizable input.
#   name : Optuna param name and (by default) flag name; 
#   type : "float" | "int" | "categorical"
#   float/int: low, high (+ optional step, log=True); categorical: choices=[...]
# Specification of all parameters

@dataclass(frozen=True)
class Bounds:
    low: float
    high: float
    log: bool = False

BOUNDS: dict[str, dict[str, Bounds]] = {
    "parameters":{
        "infection_rate": Bounds(0.01, 10.0),
        "recovery_rate": Bounds(0.01, 10.0)
    },
    "initial_states":{
        "Susceptible": Bounds(0.0, 1000),
        "Infected": Bounds(0.0, 1000),
        "Recovered": Bounds(0.0, 1000),
    }
}

class Parameters(BaseModel):
    infection_rate: float | None = None
    recovery_rate: float | None = None

class InitialStates(BaseModel):
    Susceptible: float | None = None
    Infected: float | None = None
    Recovered: float | None = None


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
    initial_states: InitialStates = InitialStates()
    study_name: str = Field(default=DEFAULT_STUDY_NAME, description="Name of optimization study")
    sampler: SamplerName = Field(default=DEFAULT_SAMPLER, description="input sampling algorithm")
    direction: Literal["maximize", "minimize"] = Field(default=DEFAULT_DIRECTION, description="optimization direction")
    n_trials: int = Field(default=DEFAULT_N_TRIALS, description="number of evals to run")

    def fixed(self) -> dict[str, dict[str, float]]:
        out: dict[str, dict[str, float]] = {}
        for group_name in ("parameters", "initial_states"):
            group = getattr(self, group_name)
            out[group_name] = {
                name: value for name, value in group if value is not None
            }
        return out

    @model_validator(mode="after")
    def _check_bounds(self):
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
        self.fixed = opt_spec.fixed()
        self.params = opt_spec.parameters
        self.init_states = opt_spec.initial_states
        self.study_name = f"{opt_spec.study_name}_{datetime.now().strftime('%m/%d/%Y-%H:%M:%S')}"
        self.sampler = SAMPLERS[opt_spec.sampler.lower()](**kwargs)
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
    def suggest(self, trial: optuna.Trial) -> None:
        """Ask Optuna for a value for one input, per its spec.

        Args:
            trial (optuna.Trial): Optuna optimization trial

        Raises:
            ValueError: Unknown input type found

        """
        values: dict[str, dict[str, float]] = {}
        for group_name, fields in BOUNDS.items():
            values[group_name] = {}
            for name, b in fields.items():
                if name in self.fixed[group_name]:
                    values[group_name][name] = self.fixed[group_name][name]
                else:
                    values[group_name][name] = trial.suggest_float(
                        f"{group_name}.{name}", b.low, b.high, log=b.log
                    )
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
        params_and_init_states = self.suggest(trial)
        params = params_and_init_states["parameters"]
        init_states = params_and_init_states["initial_states"]

        try:
            # Build and invoke the Petrinaut CLI command 
            value = self.pn_model.run(
                params=params,
                init_states=init_states
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
        log.info("trial %d  value=%.6g  params=%s  init_states=%s", trial.number, value, params, init_states)

        return value

    # ── runs for API ─────────────────────────────────────────────────────────────────
    async def stream_all(self, request: Request, n_trials: int):
        """Async generator yielding Server-side event frames, one per finished trial.

        Args:
            request (Request): Optimization API generic request
            n_trials (int): number of optimization steps

        Yields:
            _type_: json line of data or event
        """
        if not self.lock.acquire(blocking=False):
            yield 'event: error\ndata: {"message": "already running"}\n\n'
            return
 
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        stop_flag = threading.Event()

        # Callback for generating the payload from optuna optimize worker
        def callback(study, trial):
            params_and_init_states = {}
            for k, v in trial.params.items():
                outer, inner = k.split('.', 1)
                params_and_init_states.setdefault(outer, {})[inner] = v
            payload = {
                "step": trial.number,
                "params": params_and_init_states.get("parameters",dict()),
                "init_states": params_and_init_states.get("initial_states",dict()),
                "metric": trial.value,
                "state": trial.state.name,
            }
            # Pass payload to streamer
            loop.call_soon_threadsafe(q.put_nowait, payload)
            if stop_flag.is_set():
                study.stop()

        # Running the optuna optimize worker
        def run():
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
 
        threading.Thread(target=run, daemon=True).start()
 
        try:
            while True:
                item = await q.get()
                if item is _SENTINEL:
                    yield "event: done\ndata: {}\n\n"
                    break
                yield f"data: {json.dumps(item)}\n\n"
                if await request.is_disconnected():
                    stop_flag.set()
                    break
        finally:
            stop_flag.set()
            self.lock.release()

    async def stream_best(self, request: Request, n_trials: int):
        """Async generator yielding Server-side event frames, one per finished trial.

        Args:
            request (Request): Optimization API generic request
            n_trials (int): number of optimization steps

        Yields:
            _type_: json line of data or event
        """
        if not self.lock.acquire(blocking=False):
            yield 'event: error\ndata: {"message": "already running"}\n\n'
            return
 
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        stop_flag = threading.Event()

        # Callback for generating the payload from optuna optimize worker
        def callback(study, trial):
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

            best_params_and_init_states = {}
            for k, v in study.best_params.items():
                outer, inner = k.split('.', 1)
                best_params_and_init_states.setdefault(outer, {})[inner] = v
            payload = {
                "step": trial.number,
                "params": best_params_and_init_states.get("parameters",dict()),
                "init_states": best_params_and_init_states.get("initial_states",dict()),
                "metric": study.best_value,
                "state": "COMPLETE",
            }
            # Pass payload to streamer
            loop.call_soon_threadsafe(q.put_nowait, payload)
            if stop_flag.is_set():
                study.stop()

        # Running the optuna optimize worker
        def run():
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
 
        threading.Thread(target=run, daemon=True).start()
 
        try:
            while True:
                item = await q.get()
                if item is _SENTINEL:
                    yield "event: done\ndata: {}\n\n"
                    break
                yield f"data: {json.dumps(item)}\n\n"
                if await request.is_disconnected():
                    stop_flag.set()
                    break
        finally:
            stop_flag.set()
            self.lock.release()
    
    # ── run for local testing /printing ─────────────────────────────────────────────────────────────────
    def run_stream(self, study, objective, n_trials):
        q = queue.Queue()
        _DONE = object()

        def callback(study, trial):
            params_and_init_states = {}
            for k, v in trial.params.items():
                outer, inner = k.split('.', 1)
                params_and_init_states.setdefault(outer, {})[inner] = v
            q.put((
                trial.number,
                params_and_init_states.get("parameters", dict()),
                params_and_init_states.get("initial_states", dict()),
                trial.value
            ))

        def run():
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
        n_trials = 10,
        parameters = {
            "infection_rate": 0.1
        },
        initial_states = {
            "Susceptible": 100
        }
    )
    # Build the Petri net from the client spec.
    petrinet_model = PetrinautModel(pn_spec)

    # Instantiate Petrinaut optimization class
    optimizer = PetrinautOptimizer(
        opt_spec = opt_spec,
        pn_model = petrinet_model
    )

    for step, params, init_states, metric_value in optimizer.run_stream(
        optimizer.study, 
        optimizer.objective, 
        optimizer.n_trials
    ):
        log.info(json.dumps({"step":step,"params":params,"init_states":init_states,"metric":metric_value}))

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        sys.exit(130)
