from __future__ import annotations

import io
import json
from typing import Any

import pytest


class FakeProcess:
    """An in-memory stand-in for the spawned CLI process."""

    def __init__(self, responses: list[dict[str, Any]]) -> None:
        self.stdin = io.BytesIO()
        self.stdout = io.BytesIO(
            "".join(json.dumps(response) + "\n" for response in responses).encode()
        )
        self.stderr = io.BytesIO(b"Petrinaut stdio ready for model <stdin>\n")
        self.returncode: int | None = None

    def poll(self) -> int | None:
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        self.returncode = 0
        return 0

    def terminate(self) -> None:
        self.returncode = -15

    def kill(self) -> None:
        self.returncode = -9


def spawn(process: FakeProcess) -> dict[str, Any]:
    """Record the command and keyword arguments a session spawns with."""
    invocation: dict[str, Any] = {}

    def popen_factory(command: list[str], **kwargs: Any) -> FakeProcess:
        invocation["command"] = command
        invocation["kwargs"] = kwargs
        return process

    invocation["popen_factory"] = popen_factory
    return invocation


@pytest.fixture
def optimization_manifest() -> dict:
    """The bindings treat this document as opaque JSON; the CLI owns its schema."""
    return {
        "kind": "petrinaut-optimization",
        "version": 1,
        "model": {
            "title": "Example",
            "definition": {
                "scenarios": [{"id": "baseline"}],
                "metrics": [{"id": "profit", "code": "return 1;"}],
            },
        },
        "scenario": {
            "id": "baseline",
            "parameterBindings": {
                "rate": {
                    "kind": "optimize",
                    "minimum": 0.1,
                    "maximum": 2.0,
                    "scale": "log",
                },
                "capacity": {"kind": "fixed", "value": 100},
            },
        },
        "objective": {"metricId": "profit", "direction": "maximize"},
    }


@pytest.fixture
def optimization_description() -> dict:
    return {
        "direction": "maximize",
        "study": {"trials": 3, "sampler": "random", "seed": 42},
        "parameters": [
            {
                "identifier": "rate",
                "type": "float",
                "default": 0.5,
                "minimum": 0.1,
                "maximum": 2.0,
                "scale": "log",
            },
            {
                "identifier": "count",
                "type": "int",
                "default": 4,
                "minimum": 2,
                "maximum": 8,
                "step": 2,
                "scale": "linear",
            },
            {
                "identifier": "enabled",
                "type": "boolean",
                "default": True,
            },
        ],
    }
