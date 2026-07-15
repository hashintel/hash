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

from pathlib import Path

from typing import Any, Dict, Union, Sequence
from pydantic import BaseModel, Field

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
    eval_timeout: float = Field(default=DEFAULT_EVAL_TIMEOUT, description="timeout threshold for CLI eval")


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
        # Specification params
        self.model = pn_spec.model_path.resolve()
        self.cli = pn_spec.cli_path.resolve()
        self.node = node
        self.metric = pn_spec.metric
        self.steps = pn_spec.steps
        self.dt = pn_spec.dt
        self.seed = pn_spec.seed

        # The following are currently unused
        # they are left here for future releases
        self.outpath = pn_spec.outpath
        self.store = pn_spec.store
        self.command = pn_spec.command
        self.eval_timeout = pn_spec.eval_timeout
        
        # Subprocess for calling petrinaut CLI
        self._process: subprocess.Popen[str] | None = None
        # Request id counter
        self._next_id = 1

        # Default coloured place
        self.supply_score = {
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
        

    def __enter__(self) -> "PetrinautClient":
        self.start()
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()
    

    def _build_payload(self, parameters:dict, initial_state:dict, method:str = 'run') -> Dict[str,Union[str,Dict]]:
        
        payload: dict[str, Any] = {
            "id": self._next_id, 
            "method": method,
            "params": {
                "parameters": parameters,
                "initialState": {
                    **initial_state,
                    "SupplyScore":[self.supply_score]
                },
                "metrics": [self.metric],
                "maxSteps": self.steps,
                "dt": self.dt,
                "seed": self.seed
            }
        }
        self._next_id += 1
        return payload

    def start(self) -> None:
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

        self._process.stdin.write(json.dumps(request) + "\n")
        self._process.stdin.flush()
        line = self._process.stdout.readline()
        if not line:
            stderr = (
                self._process.stderr.read() if self._process.stderr is not None else ""
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
        return self.request("metadata")
    
    def close(self) -> None:
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

    
    # ── CLI invokation ─────────────────────────────────────────────────────────
    def _cli_build_command(self, inputs: dict) -> list:
        """Turn a {name: value} dict into the full argv list."""
        cmd = list(self.command)
        for name, value in inputs.items():
            # Default flag per input: "initial_tokens" -> "--initial-tokens".
            cmd += [f"--{name.replace('_', '-')}", str(value)]
        return cmd

    def cli_run(self, inputs: dict):
        """Invokes the Petrinaut Cli

        Args:
            inputs (dict): All inputs (optimized and fixed) to Petrinaut

        Returns:
            proc (CompletedProcess): A completed subprocess run
        """
        # Build the CLI command invocation as a string
        cmd = self._cli_build_command(inputs)

        # Call Petrinaut cli here
        proc = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=self.eval_timeout, check=True,
        )
        return proc

    @staticmethod
    def _parse_output(stdout: str) -> float:
        """Extract the objective: the last number printed on stdout."""
        matches = _NUMBER.findall(stdout)
        if not matches:
            raise ValueError(f"no number found in CLI output:\n{stdout!r}")
        return float(matches[-1])


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(message)s",
        datefmt="%H:%M:%S",
    )

    # Create the petrinaut execution specification
    pn_spec = PetrinautModelSpec()
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



# def run_sir_demo(client: PetrinautClient) -> None:
#     metadata = client.metadata()
#     result = client.run(
#         parameters={"infection_rate": 1.5, "recovery_rate": 0.8},
#         initialState={"Susceptible": 990, "Infected": 10, "Recovered": 0},
#         metrics=["Infected Fraction"],
#         maxSteps=100,
#         dt=0.1,
#         seed=4242,
#     )
#     print(
#         json.dumps(
#             {
#                 "metricNames": [metric["name"] for metric in metadata["metrics"]],
#                 "result": result,
#             },
#             indent=2,
#         )
#     )


# def main() -> None:
#     parser = argparse.ArgumentParser(description=__doc__)
#     parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
#     parser.add_argument("--cli", type=Path, default=DEFAULT_CLI)
#     parser.add_argument("--node", default="node")
#     parser.add_argument(
#         "--demo",
#         action="store_true",
#         help="Run a complete SIR example instead of forwarding stdin.",
#     )
#     args = parser.parse_args()

#     with PetrinautClient(model=args.model, cli=args.cli, node=args.node) as client:
#         if args.demo:
#             run_sir_demo(client)
#         else:
#             bridge_stdio(client)
