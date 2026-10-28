"""Reusable support for the optimizer core tests."""

import asyncio
from typing import TypedDict

from petrinaut_optimizer_core.study import Scalar


class OptimizationDescription(TypedDict):
    direction: str
    study: dict[str, object]
    parameters: list[dict[str, object]]


def objective_of_values(values: dict[str, Scalar]) -> float:
    return float(values["rate"] + values["count"] + int(values["enabled"]))


def completed[T](value: T) -> asyncio.Future[T]:
    """Return an already settled awaitable without a scheduler yield."""
    future: asyncio.Future[T] = asyncio.get_running_loop().create_future()
    future.set_result(value)
    return future
