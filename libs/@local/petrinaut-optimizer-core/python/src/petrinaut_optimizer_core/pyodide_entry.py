"""The functions a Pyodide host calls once this package is imported there.

A study lives in a `StudyHandle` between runs, so the host can stop a study
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

from .ask_tell import run_study, told_trials
from .description import MAX_STUDY_TRIALS, StudyDescription, parse_description
from .importance import (
    completed_trials,
    importance_cadence,
    importance_floor,
    parameter_importances,
)
from .study import Scalar, create_study


@dataclass
class StudyHandle:
    """A study kept between runs.

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


def importances_of(study: optuna.Study) -> dict[str, Any] | None:
    """The `importances` block for an event, or None when the estimate is unavailable."""
    values = parameter_importances(study)
    if values is None:
        return None
    return {"values": values, "completedTrials": completed_trials(study)}


def attach_importances(study: optuna.Study, event: dict[str, Any]) -> None:
    importances = importances_of(study)
    if importances is not None:
        event["importances"] = importances


def with_importances_at_cadence(
    study: optuna.Study, requested: int, on_trial: Callable[[dict[str, Any]], object]
) -> Callable[[dict[str, Any]], object]:
    """Wrap `on_trial` so every `importance_cadence` completed trials past the floor carry an estimate.

    The count is the study's own, so a continued study keeps the rhythm it had.
    The estimate never raises, and a trial it is unavailable for goes out
    without the key; the study never fails for its importances.
    """
    floor = importance_floor(requested)
    cadence = importance_cadence(requested)

    def report(event: dict[str, Any]) -> object:
        if event.get("state") == "complete":
            completed = completed_trials(study)
            if completed >= floor and (completed - floor) % cadence == 0:
                attach_importances(study, event)
        return on_trial(event)

    return report


def create_browser_study(description_json: str, parallelism: int = 1) -> StudyHandle:
    """Parse the description and build its study.

    `parallelism` is how many trials every run on the handle keeps in flight;
    above 1 it makes the TPE sampler account for trials in flight. The warning
    Optuna raises for that experimental argument is silenced around the
    construction; the host is single-threaded, so swapping the process-wide
    warning filters is safe here.
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
    is_paused: Callable[[], object] = lambda: False,
) -> Awaitable[dict[str, Any]]:
    """Run `trials` more trials on the handle's study and return the awaitable summary.

    The arguments are checked and `handle.requested` grows by `trials` before
    this returns. Once the run settles, `handle.requested` is the number of
    trials the study was told an outcome for, so the segment after a stop, a
    pause or an error counts from the trials the study holds. `evaluate`
    receives each trial's suggested values as a Python dict and may resolve to
    a JavaScript object; `on_trial` receives plain dicts. `is_paused` drains
    the segment as `ask_tell.run_study` describes.
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
    handle.requested += trials
    handle.running = True

    async def evaluate_trial(values: dict[str, Scalar]) -> Mapping[str, Any]:
        return _object(to_python(await evaluate(values)), "trial outcome")

    async def run() -> dict[str, Any]:
        try:
            summary = await run_study(
                study,
                handle.description,
                trials=trials,
                evaluate=evaluate_trial,
                on_trial=with_importances_at_cadence(study, handle.requested, on_trial),
                is_cancelled=lambda: bool(is_cancelled()),
                is_paused=lambda: bool(is_paused()),
                parallelism=handle.parallelism,
            )
            summary["requestedTrials"] = handle.requested
            attach_importances(study, summary)
            return summary
        finally:
            handle.running = False
            handle.requested = told_trials(study)

    return run()


def release_browser_study(handle: StudyHandle) -> None:
    """Drop the study so its trials can be freed; a segment still running ends on its own cancellation."""
    handle.study = None
