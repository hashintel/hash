from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from petrinaut_optimizer_core import run_browser_study, to_python

from .conftest import objective_of_values


class FakeJsProxy:
    """Stands in for a Pyodide JsProxy: only `to_py` matters to the entry point."""

    def __init__(self, value: Any) -> None:
        self.value = value

    def to_py(self) -> Any:
        return self.value


def test_to_python_unwraps_proxies_and_passes_plain_values_through() -> None:
    assert to_python(FakeJsProxy({"objective": 1.0})) == {"objective": 1.0}
    assert to_python({"objective": 2.0}) == {"objective": 2.0}
    assert to_python(3) == 3


def test_runs_a_study_from_json_with_javascript_style_callbacks(
    optimization_description: dict[str, Any],
) -> None:
    events: list[dict[str, Any]] = []
    evaluated: list[dict[str, Any]] = []

    async def evaluate(values: dict[str, Any]) -> FakeJsProxy:
        evaluated.append(values)
        return FakeJsProxy(
            {"kind": "objective", "objective": objective_of_values(values)}
        )

    summary = asyncio.run(
        run_browser_study(
            json.dumps(optimization_description),
            evaluate,
            events.append,
            lambda: False,
        )
    )

    assert len(evaluated) == 3
    assert [event["trial"] for event in events] == [0, 1, 2]
    assert all(isinstance(event, dict) for event in events)
    assert summary["completedTrials"] == 3
    assert summary["best"] == events[-1]["best"]


@pytest.mark.parametrize(
    ("cancelled", "completed_trials"),
    [(True, 0), (False, 3)],
)
def test_cancellation_is_unwrapped_from_the_callback_proxy(
    optimization_description: dict[str, Any],
    cancelled: bool,
    completed_trials: int,
) -> None:
    async def evaluate(values: dict[str, Any]) -> dict[str, Any]:
        return {"objective": objective_of_values(values)}

    summary = asyncio.run(
        run_browser_study(
            json.dumps(optimization_description),
            evaluate,
            lambda _event: None,
            lambda: FakeJsProxy(cancelled),
        )
    )

    assert summary["completedTrials"] == completed_trials
    assert summary["cancelled"] is cancelled


def test_rejects_a_description_that_breaks_a_rule(
    optimization_description: dict[str, Any],
) -> None:
    optimization_description["study"]["seed"] = -1

    async def evaluate(_values: dict[str, Any]) -> dict[str, Any]:
        return {"objective": 0.0}

    with pytest.raises(ValueError, match="non-negative integer"):
        asyncio.run(
            run_browser_study(
                json.dumps(optimization_description),
                evaluate,
                lambda _event: None,
                lambda: False,
            )
        )


def test_rejects_an_outcome_that_is_not_an_object(
    optimization_description: dict[str, Any],
) -> None:
    async def evaluate(_values: dict[str, Any]) -> float:
        return 1.0

    with pytest.raises(ValueError, match="trial outcome must be a JSON object"):
        asyncio.run(
            run_browser_study(
                json.dumps(optimization_description),
                evaluate,
                lambda _event: None,
                lambda: False,
            )
        )
