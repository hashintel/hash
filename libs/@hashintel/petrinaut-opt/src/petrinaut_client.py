#!/usr/bin/env python3
"""Python Wrapper for Petri Net execution CLI.

Inputs: all parameters and initial states to a Petri Net (both fixed and optimizable)
Output: metric computed inside Petrinaut CLI at the end of the Petri Net execution


Example:
    python3 petrinaut_cli.py --produce-a 0.5 --produce-b 0.5 \
        --initial-tokens 100 --policy balance
"""

import logging

import re
import uuid
import json
import socket
import argparse
import subprocess

from typing import Optional, Dict, Union, Sequence
from pydantic import BaseModel, Field

log = logging.getLogger("pn_client")

# The Petrinaut execution program parameters
DEFAULT_MODEL = "SIR"
DEFAULT_STRUCTURE = ""
DEFAULT_METRIC = "Infected Fraction"
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
    name: str = Field(default=DEFAULT_MODEL, description="Petri Net class name")
    structure: str = Field(default=DEFAULT_STRUCTURE, description="Filepath of Petri Net model structure (places, transitions, arcs etc.)")
    metric: str = Field(default=DEFAULT_METRIC, description="Metric name that will be computed at the end of execution")
    steps: Optional[int] = Field(default=DEFAULT_STEPS, description="Number of steps in a single execution")
    dt: Optional[float] = Field(default=DEFAULT_TIMESTEP, description="Step size for dynamics discretisation in a single execution")
    seed: Optional[int] = Field(default=DEFAULT_SEED, description="Random number generator seed (fixed -> deterministic output)")
    store: Optional[Sequence[str]] = Field(default=DEFAULT_STORE, description="Quantities to store/print inside execution")
    outpath: Optional[str] = Field(default=DEFAULT_OUTPATH, description="Filepath to execution trace")
    command: Optional[str] = Field(default=DEFAULT_COMMAND, description="Petrinaut CLI command to invoke")
    eval_timeout: Optional[float] = Field(default=DEFAULT_EVAL_TIMEOUT, description="timeout threshold for CLI eval")


# ─────────────────────────────────────────────────────────────────────────────
# Petrinaut CLI Python wrapper
# ─────────────────────────────────────────────────────────────────────────────

class PetrinautModel:
    """Python wrapper for Petrinaut execution CLI."""
    
    def __init__(
        self,
        pn_spec: PetrinautModelSpec,
        **kwargs
    ) -> None:
        self.name = pn_spec.name
        self.structure = pn_spec.structure
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
        
        # Connect to Petrinaut-cli socket
        self.stream = self.connect()
    
    def connect(self):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect("/tmp/petrinaut.sock")
        stream = sock.makefile("rwb")
        return stream

    # ── UNIX request submission ─────────────────────────────────────────────────────────
    def _build_payload(self, params:dict, init_states:dict) -> Dict[str,Union[str,Dict]]:
        
        return {
            "id": str(uuid.uuid4()),
            "method": "run",
            "params": {
                "parameters": params,
                "initialState": init_states,
                "metrics": [self.metric],
                "maxSteps": self.steps,
                "dt": self.dt,
                "seed": self.seed
            }
        }


    def run(self, params:dict, init_states:dict):
        """Submits request to Petrinaut-cli UNIT socket

        Args:
            params (dict): All parameters (optimized and fixed) to Petrinaut CLI
            init_states (dict): All initial states (optimized and fixed) to Petrinaut CLI

        Returns:
            objective (float): The metric evaluated from petrinaut-cli execution
        """

        # Build payload first
        payload = self._build_payload(
            params=params,
            init_states=init_states
        )
        # Write to stream
        self.stream.write((json.dumps(payload) + "\n").encode())
        self.stream.flush()
        # Get Petrinaut-cli response
        response = json.loads(self.stream.readline())
        
        if "error" in response:
            raise RuntimeError(response["error"]["message"])
        
        # Return the objective (metric) from the execution
        objective = response["result"]["metrics"][self.metric]
        return objective
    
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

    p = argparse.ArgumentParser(description="Toy Petri-net execution function.")
    p.add_argument("--infection_rate", type=float, required=True,
                   help="infection rate in SIR Petri Net")
    p.add_argument("--recovery_rate", type=float, required=True,
                   help="recovery rate in SIR Petri Net")
    p.add_argument("--susceptible", type=int, required=True,
                   help="Number of susceptible individuals in SIR Petri Net")
    p.add_argument("--infected", type=int, required=True,
                   help="Number of infected individuals in SIR Petri Net")
    p.add_argument("--recovered", type=int, required=True,
                   help="Number of recovered individuals in SIR Petri Net")
    p.add_argument("--steps", type=int, default=1000,
                   help="simulation steps (fixed; not optimized)")
    p.add_argument("--seed", type=int, default=0,
                   help="RNG seed (fixed -> deterministic output)")
    args = p.parse_args()

    # Create the petrinaut execution specification
    pn_spec = PetrinautModelSpec()
    # Build the Petri net from the client spec.
    petrinet_model = PetrinautModel(pn_spec)
    # Run petrinaut once to get metric value
    metric_value = petrinet_model.run(
        params = {"infection_rate": args.infection_rate, "recovery_rate": args.recovery_rate},
        init_states = {"Susceptible": args.susceptible}
    )
    # Read metric value from petrinaut execution
    log.info('metric_value',metric_value)
