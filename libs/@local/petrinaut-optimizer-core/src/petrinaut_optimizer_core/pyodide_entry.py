"""The function the browser worker calls once this package is imported in Pyodide.

Nothing here imports `pyodide`: the JavaScript callbacks arrive as proxies and
a proxy's result is unwrapped by duck-typing its `to_py`, so the module runs
under CPython too and its tests need no browser.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, cast

from .ask_tell import run_study
from .description import parse_description
from .study import Scalar, create_study


def to_python(value: object) -> object:
    """Unwrap a JsProxy into Python data; any other value passes through."""
    converter = getattr(value, "to_py", None)
    return converter() if callable(converter) else value


def _object(value: object, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be a JSON object")
    return cast("Mapping[str, Any]", value)


async def run_browser_study(
    description_json: str,
    evaluate: Callable[[dict[str, Scalar]], Awaitable[object]],
    on_trial: Callable[[dict[str, Any]], object],
    is_cancelled: Callable[[], object],
) -> dict[str, Any]:
    """Parse the description, build the study, and run the ask/tell loop.

    `evaluate` receives each trial's suggested values as a Python dict and may
    resolve to a JavaScript object; `on_trial` receives plain dicts.
    """
    description = parse_description(
        _object(json.loads(description_json), "optimization description")
    )
    study = create_study(description)

    async def evaluate_trial(values: dict[str, Scalar]) -> Mapping[str, Any]:
        return _object(to_python(await evaluate(values)), "trial outcome")

    return await run_study(
        study,
        description,
        evaluate=evaluate_trial,
        on_trial=on_trial,
        is_cancelled=lambda: bool(to_python(is_cancelled())),
    )
