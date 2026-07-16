#!/usr/bin/env python3
"""Python Wrapper for Petri Net execution CLI.

Inputs: all parameters and initial states to a Petri Net (both fixed and optimizable)
Output: metric computed inside Petrinaut CLI at the end of the Petri Net execution


Example:
    python3 petrinaut_cli.py --produce-a 0.5 --produce-b 0.5 \
        --initial-tokens 100 --policy balance
"""
from __future__ import annotations
import logging

import re
import json
import subprocess
import threading

from pathlib import Path

from typing import Any, Dict, Union, Sequence
from pydantic import BaseModel, Field, PositiveFloat

log = logging.getLogger("pn_client")

# The Petrinaut execution program parameters
PACKAGE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_CLI_PATH = PACKAGE_ROOT / "libs" / "@hashintel" / "petrinaut-cli" /  "dist" / "cli.js"
DEFAULT_MODEL_PATH = PACKAGE_ROOT / "libs" / "@hashintel" / "petrinaut-cli" / "examples" / "supply-chain-profit-model.json"
DEFAULT_METRIC = "Profit"
DEFAULT_STEPS = 100
DEFAULT_TIMESTEP = 0.1
DEFAULT_SEED = 1234
DEFAULT_STORE = ["metric"]
DEFAULT_OUTPATH = ""
DEFAULT_COMMAND = ""
DEFAULT_EVAL_TIMEOUT = None

# Regex for extracting number from Petrinaut CLI
_NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


# ─────────────────────────────────────────────────────────────────────────────
# Petrinaut CLI Python wrapper specification
# ─────────────────────────────────────────────────────────────────────────────

class PetrinautModelSpec(BaseModel):
    model_path: str = Field(default=DEFAULT_MODEL_PATH, description="Filepath to Petri Net JSON model")
    cli_path: str = Field(default=DEFAULT_CLI_PATH, description="Filepath to Petrinaut CLI")
    metric: str = Field(default=DEFAULT_METRIC, description="Metric name that will be computed at the end of execution")
    steps: int = Field(default=DEFAULT_STEPS, description="Number of steps in a single execution")
    dt: float = Field(default=DEFAULT_TIMESTEP, description="Step size for dynamics discretisation in a single execution")
    seed: int = Field(default=DEFAULT_SEED, description="Random number generator seed (fixed -> deterministic output)")
    store: Sequence[str] = Field(default=DEFAULT_STORE, description="Quantities to store/print inside execution")
    outpath: str = Field(default=DEFAULT_OUTPATH, description="Filepath to execution trace")
    command: str = Field(default=DEFAULT_COMMAND, description="Petrinaut CLI command to invoke")
    eval_timeout: PositiveFloat | None = Field(default=DEFAULT_EVAL_TIMEOUT, description="timeout threshold for CLI eval")

# ─────────────────────────────────────────────────────────────────────────────
# Petrinaut CLI Python wrapper
# ─────────────────────────────────────────────────────────────────────────────

class PetrinautModel:
    """Python wrapper for Petrinaut execution CLI."""
    
    def __init__(
        self,
        pn_spec: PetrinautModelSpec,
        node: str = "node",
        **kwargs
    ) -> None:
        """Configure the wrapper from a model spec (the CLI is not started here).

        Args:
            pn_spec (PetrinautModelSpec): Execution spec (model/CLI paths, metric, steps, dt, seed, ...).
            node (str): Node.js executable used to launch the CLI. Defaults to "node".
            **kwargs: Accepted and ignored; reserved for future options.
        """
        # Specification params
        self.model = Path(pn_spec.model_path).resolve()
        self.cli = Path(pn_spec.cli_path).resolve()
        self.node = node
        self.metric = pn_spec.metric
        self.steps = pn_spec.steps
        self.dt = pn_spec.dt
        self.seed = pn_spec.seed
        self.eval_timeout = pn_spec.eval_timeout

        # The following are currently unused
        # they are left here for future releases
        self.outpath = pn_spec.outpath
        self.store = pn_spec.store
        self.command = pn_spec.command
        
        # Subprocess for calling petrinaut CLI
        self._process: subprocess.Popen[str] | None = None
        # Request id counter
        self._next_id = 1

        # Default coloured place
        self.financial_data = {
            "cumulative_profit":0,
            "cumulative_units_sold":0,
            "effective_demand":0,
            "demand_multiplier":1.35,
            "profit_rate":0,
            "current_production_rate":125,
            "current_selling_price":37,
            "current_marketing_spend":32,
            "current_expedite_fraction":0.33
        }
        

    def __enter__(self) -> "PetrinautModel":
        """Start the CLI subprocess and return this instance for `with` use.

        Returns:
            PetrinautModel: This started wrapper instance.
        """
        self.start()
        return self

    def __exit__(self, *_args: object) -> None:
        """Close the CLI subprocess on context-manager exit.

        Args:
            *_args (object): Exception type/value/traceback, ignored.
        """
        self.close()
    

    def _build_payload(self, parameters:dict, initial_state:dict, method:str = 'run') -> Dict[str,Union[str,Dict]]:
        """Build a JSON-RPC request payload for the CLI and advance the request id.

        Args:
            parameters (dict): Petri-net parameters for this run.
            initial_state (dict): Initial state per place; a default `FinancialData` is injected.
            method (str): Protocol method to invoke. Defaults to 'run'.

        Returns:
            Dict[str, Union[str, Dict]]: The request payload to send to the CLI.
        """
        _initial_state = initial_state if initial_state else dict()
        _initial_state["FinancialData"] = [self.financial_data]
        payload: dict[str, Any] = {
            "id": self._next_id, 
            "method": method,
            "params": {
                "parameters": parameters,
                "initialState": _initial_state,
                "metrics": [self.metric],
                "maxSteps": self.steps,
                "dt": self.dt,
                "seed": self.seed
            }
        }
        self._next_id += 1
        return payload

    def start(self) -> None:
        """Launch the Petrinaut CLI subprocess in stdio serve mode.

        Raises:
            FileNotFoundError: The CLI bundle or model file does not exist.
            RuntimeError: The CLI's stderr is unavailable or it fails to signal readiness.
        """
        # Reclaim any existing child before spawning a new one, so a second start()
        # can never orphan a running CLI we no longer have a handle to.
        if self._process is not None:
            self.close()
            
        if not self.cli.is_file():
            raise FileNotFoundError(
                f"Petrinaut CLI not found at {self.cli}. Build it first."
            )
        if not self.model.is_file():
            raise FileNotFoundError(f"Model not found at {self.model}")

        self._process = subprocess.Popen(
            [
                self.node,
                str(self.cli),
                "serve",
                "--model",
                str(self.model),
                "--stdio",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        if self._process.stderr is None:
            raise RuntimeError("Petrinaut stderr is unavailable")
        status = self._process.stderr.readline()
        if not status.startswith("Petrinaut stdio ready"):
            details = status + self._process.stderr.read()
            self.close()
            raise RuntimeError(f"Petrinaut failed to start:\n{details.strip()}")

    def exchange(self, request: dict[str, Any]) -> dict[str, Any]:
        """Send one raw protocol request and return its raw response."""
        if (
            self._process is None
            or self._process.stdin is None
            or self._process.stdout is None
        ):
            raise RuntimeError("PetrinautClient has not been started")

        process = self._process
        process.stdin.write(json.dumps(request) + "\n")
        process.stdin.flush()

        timer = None
        timed_out = threading.Event()
        if self.eval_timeout is not None:
            # Unblock a hung readline by killing the CLI after eval_timeout seconds.
            # Capture this specific process so a late timer can never kill a
            # replacement started during timeout recovery.
            def kill_on_timeout() -> None:
                timed_out.set()
                if process.poll() is None:
                    process.kill()

            timer = threading.Timer(self.eval_timeout, kill_on_timeout)
            timer.start()
        try:
            line = process.stdout.readline()
        finally:
            if timer is not None:
                timer.cancel()
                # If the callback started concurrently with cancel(), wait for it
                # to finish before deciding whether this exchange timed out.
                timer.join()

        if timed_out.is_set():
            stderr = process.stderr.read() if process.stderr is not None else ""
            try:
                self.close()
                self.start()
            except Exception as exc:
                raise RuntimeError(
                    "Petrinaut timed out and the CLI could not be restarted: "
                    f"{exc}"
                ) from exc
            raise RuntimeError(
                f"Petrinaut timed out without a response:\n{stderr.strip()}"
            )

        if not line:
            stderr = (
                process.stderr.read() if process.stderr is not None else ""
            )
            raise RuntimeError(
                f"Petrinaut exited without a response:\n{stderr.strip()}"
            )
        
        response = json.loads(line)
        if not isinstance(response, dict):
            raise RuntimeError("Petrinaut returned a non-object response")
        return response

    
    def request(self, method: str, parameters: dict[str, Any] | None = None, initial_state: dict[str,Any] | None = None) -> Any:
        """Submits request to Petrinaut-cli UNIT socket and raises a Python exception for protocol errors."""
        # Build payload first
        payload = self._build_payload(
            method=method,
            parameters=parameters,
            initial_state=initial_state
        )
        response = self.exchange(payload)
        if "error" in response:
            error = response["error"]
            message = error.get("message", error) if isinstance(error, dict) else error
            raise RuntimeError(str(message))
        return response.get("result")

    def objective(self, parameters:dict, initial_state:dict) -> dict[str, Any]:
        """Submits a run request to Petrinaut-cli UNIT socket and returns single-vale objective 

        Args:
            parameters (dict): All parameters (optimized and fixed) to Petrinaut CLI
            initial_state (dict): All initial states (optimized and fixed) to Petrinaut CLI

        Returns:
            objective (float): The metric evaluated from petrinaut-cli execution
        """
        response = self.request(method="run", parameters=parameters, initial_state=initial_state)
        # Return the objective (metric) from the execution
        objective = response["metrics"][self.metric]
        return objective

    def metadata(self) -> dict[str, Any]:
        """Request the loaded model's metadata from the CLI.

        Returns:
            dict[str, Any]: The metadata result returned by the CLI.
        """
        return self.request("metadata")

    def close(self) -> None:
        """Terminate the CLI subprocess and close its stdio streams if running."""
        if self._process is not None:
            if self._process.stdin is not None:
                self._process.stdin.close()
            if self._process.poll() is None:
                try:
                    self._process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._process.terminate()
                    self._process.wait()
            if self._process.stdout is not None:
                self._process.stdout.close()
            if self._process.stderr is not None:
                self._process.stderr.close()
            self._process = None


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(message)s",
        datefmt="%H:%M:%S",
    )

    # Create the petrinaut execution specification
    pn_spec = PetrinautModelSpec(
        steps = 365,
        seed = 1234
    )
    # Build the Petri net from the client spec in a context manager
    with PetrinautModel(pn_spec) as petrinet_model:
        # Run petrinaut once to get metric value
        metric_value = petrinet_model.objective(
            parameters = {
                "production_rate": 100.0, 
                "reorder_threshold": 160,
                "batch_size":180,
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
    # Read metric value from petrinaut execution
    log.info(f'metric_value = {metric_value}')