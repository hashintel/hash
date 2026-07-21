#!/usr/bin/env python3
"""Small Python client for the Petrinaut CLI's native stdio transport.

The wrapper starts the CLI, sends one JSON request per stdin line, and writes
one JSON response per stdout line. It has no third-party dependencies.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CLI = PACKAGE_ROOT / "dist" / "cli.js"
DEFAULT_MODEL = PACKAGE_ROOT / "examples" / "sir-model.json"


class PetrinautClient:
    """Owns one Petrinaut process connected over stdin/stdout."""

    def __init__(
        self,
        model: Path,
        cli: Path = DEFAULT_CLI,
        node: str = "node",
    ) -> None:
        self.model = model.resolve()
        self.cli = cli.resolve()
        self.node = node
        self._process: subprocess.Popen[str] | None = None
        self._next_id = 1

    def __enter__(self) -> "PetrinautClient":
        self.start()
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

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

    def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        """Call one method and raise a Python exception for protocol errors."""
        request: dict[str, Any] = {"id": self._next_id, "method": method}
        self._next_id += 1
        if params is not None:
            request["params"] = params

        response = self.exchange(request)
        if "error" in response:
            error = response["error"]
            message = error.get("message", error) if isinstance(error, dict) else error
            raise RuntimeError(str(message))
        return response.get("result")

    def metadata(self) -> dict[str, Any]:
        return self.request("metadata")

    def run(self, **params: Any) -> dict[str, Any]:
        return self.request("run", params)

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


def run_sir_demo(client: PetrinautClient) -> None:
    metadata = client.metadata()
    result = client.run(
        parameters={"infection_rate": 1.5, "recovery_rate": 0.8},
        initialState={"Susceptible": 990, "Infected": 10, "Recovered": 0},
        metrics=["Infected Fraction"],
        maxSteps=100,
        dt=0.1,
        seed=4242,
    )
    print(
        json.dumps(
            {
                "metricNames": [metric["name"] for metric in metadata["metrics"]],
                "result": result,
            },
            indent=2,
        )
    )


def bridge_stdio(client: PetrinautClient) -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object")
            response = client.exchange(request)
        except Exception as error:  # Keep the bridge alive for the next request.
            response = {"id": None, "error": {"message": str(error)}}
        print(json.dumps(response), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--cli", type=Path, default=DEFAULT_CLI)
    parser.add_argument("--node", default="node")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run a complete SIR example instead of forwarding stdin.",
    )
    args = parser.parse_args()

    with PetrinautClient(model=args.model, cli=args.cli, node=args.node) as client:
        if args.demo:
            run_sir_demo(client)
        else:
            bridge_stdio(client)


if __name__ == "__main__":
    main()
