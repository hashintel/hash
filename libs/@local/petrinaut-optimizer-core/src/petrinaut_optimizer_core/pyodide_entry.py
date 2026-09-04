"""The functions the browser worker calls once this package is imported in Pyodide.

A study lives in a `StudyHandle` between runs, so the worker can stop a study
and later ask for more trials on the same sampler history. Nothing here imports
`pyodide`: the JavaScript callbacks arrive as proxies and a proxy's result is
unwrapped by duck-typing its `to_py`, so the module runs under CPython too and
its tests need no browser.
"""

from __future__ import annotations

import json
import warnings
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, cast

import optuna
from optuna.exceptions import ExperimentalWarning

from .ask_tell import run_study
from .description import MAX_STUDY_TRIALS, StudyDescription, parse_description
from .study import Scalar, create_study, told_trials


@dataclass
class StudyHandle:
    """A study the worker keeps between runs.

    `requested` is the number of trials the study is heading for: the trials
    told so far plus those still to run in the current segment. `study` is
    None once the handle is released.
    """

    description: StudyDescription
    parallelism: int
    study: optuna.Study | None
    requested: int = 0
    running: bool = False


def to_python(value: object) -> object:
    """Unwrap a JsProxy into Python data; any other value passes through."""
    converter = getattr(value, "to_py", None)
    return converter() if callable(converter) else value


def _object(value: object, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be a JSON object")
    return cast("Mapping[str, Any]", value)


def _positive_integer(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"optimization {name} must be a positive integer")
    return value


def create_browser_study(description_json: str, parallelism: int = 1) -> StudyHandle:
    """Parse the description and build its study.

    `parallelism` above 1 makes the TPE sampler account for trials in flight.
    The warning Optuna raises for that experimental argument is silenced
    around the construction; the worker is single-threaded, so swapping the
    process-wide warning filters is safe here.
    """
    description = parse_description(
        _object(json.loads(description_json), "optimization description")
    )
    parallelism = _positive_integer(parallelism, "parallelism")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ExperimentalWarning)
        study = create_study(description, constant_liar=parallelism > 1)
    return StudyHandle(description, parallelism, study)


def run_browser_study(
    handle: StudyHandle,
    trials: int,
    evaluate: Callable[[dict[str, Scalar]], Awaitable[object]],
    on_trial: Callable[[dict[str, Any]], object],
    is_cancelled: Callable[[], object],
    parallelism: int | None = None,
) -> Awaitable[dict[str, Any]]:
    """Run `trials` more trials on the handle's study and return the awaitable summary.

    The arguments are checked and `handle.requested` grows by `trials` before
    this returns, so the caller can report the new total as soon as the run is
    scheduled. A stopped run drops the trials it never reported from
    `requested`, so the next segment counts from the trials the study holds.
    `evaluate` receives each trial's suggested values as a Python dict and may
    resolve to a JavaScript object; `on_trial` receives plain dicts.
    `parallelism` defaults to the value the study was created with.
    """
    study = handle.study
    if study is None:
        raise ValueError("the optimization study was released")
    if handle.running:
        raise ValueError("the optimization study is already running")
    trials = _positive_integer(trials, "trials")
    if handle.requested + trials > MAX_STUDY_TRIALS:
        raise ValueError(
            f"an optimization study must not exceed {MAX_STUDY_TRIALS} trials"
        )
    segment_parallelism = (
        handle.parallelism
        if parallelism is None
        else _positive_integer(parallelism, "parallelism")
    )
    handle.requested += trials
    handle.running = True

    async def evaluate_trial(values: dict[str, Scalar]) -> Mapping[str, Any]:
        return _object(to_python(await evaluate(values)), "trial outcome")

    async def run() -> dict[str, Any]:
        try:
            summary = await run_study(
                study,
                handle.description,
                evaluate=evaluate_trial,
                on_trial=on_trial,
                is_cancelled=lambda: bool(to_python(is_cancelled())),
                trials=trials,
                parallelism=segment_parallelism,
                requested_trials=handle.requested,
            )
        finally:
            handle.running = False
        if summary["cancelled"]:
            handle.requested = told_trials(study)
        return summary

    return run()


def release_browser_study(handle: StudyHandle) -> None:
    """Drop the study so its trials can be freed; a segment still running ends on its own cancellation."""
    handle.study = None
