"""The ask/tell loop: Optuna proposes, the caller evaluates, the study learns.

The loop owns no simulation. Each trial's values go to `evaluate`, an awaitable
the caller supplies, and the outcome is told back to the study. The shapes the
loop reports, one event per told trial and one summary per run, are built here
too.
"""

import asyncio
import math
from collections import deque
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Literal

import optuna
from optuna.trial import FrozenTrial, TrialState

from .description import StudyDescription
from .reports import BestTrialReport, RunSummary, StudySummary, TrialEvent
from .study import Scalar, suggest

type Evaluate = Callable[[dict[str, Scalar]], Awaitable[Mapping[str, object]]]
type OnTrial = Callable[[TrialEvent], object]
type IsCancelled = Callable[[], bool]
type IsPaused = Callable[[], bool]

_STATE_NAMES: dict[TrialState, Literal["complete", "pruned", "failed"]] = {
    TrialState.COMPLETE: "complete",
    TrialState.PRUNED: "pruned",
    TrialState.FAIL: "failed",
}


def objective_of(outcome: Mapping[str, object]) -> float | None:
    """Return the finite objective of `{"objective": x}`, or None for `{"pruned": reason}`."""
    if "pruned" in outcome:
        return None
    objective = outcome.get("objective")
    if (
        isinstance(objective, bool)
        or not isinstance(objective, (int, float))
        or not math.isfinite(objective)
    ):
        raise ValueError("trial objective must be a finite number")
    return float(objective)


def best_summary(study: optuna.Study) -> BestTrialReport | None:
    """Return the best completed trial, or None while no trial has completed."""
    try:
        best = study.best_trial
    except ValueError:
        return None
    return {
        "trial": best.number,
        "parameters": dict(best.params),
        "objective": best.value,
    }


def trial_event(study: optuna.Study, trial: FrozenTrial) -> TrialEvent:
    return {
        "trial": trial.number,
        "parameters": dict(trial.params),
        "objective": trial.value,
        "state": _STATE_NAMES[trial.state],
        "best": best_summary(study),
    }


# Set on a trial the loop tells failed without reporting it, at a stop or an
# error, so the summary's counters skip it as the events did.
UNREPORTED_ATTR = "petrinaut_unreported"


def told_trials(study: optuna.Study) -> int:
    """How many of the study's trials were told an outcome the loop reported: complete or pruned.

    A trial failed by a stop produced no event, so it is not counted and a
    continued study heads for the total its caller sees.
    """
    return sum(
        1
        for trial in study.get_trials(deepcopy=False)
        if trial.state in {TrialState.COMPLETE, TrialState.PRUNED}
    )


def study_summary(study: optuna.Study) -> StudySummary:
    """Return the study's counters and best, over the trials the loop reported."""
    trials = study.get_trials(deepcopy=False)
    states = [trial.state for trial in trials]
    return {
        "completedTrials": states.count(TrialState.COMPLETE),
        "prunedTrials": states.count(TrialState.PRUNED),
        "failedTrials": sum(
            1
            for trial in trials
            if trial.state == TrialState.FAIL and not trial.user_attrs.get(UNREPORTED_ATTR)
        ),
        "best": best_summary(study),
    }


def _tell(study: optuna.Study, trial: optuna.Trial, outcome: Mapping[str, object]) -> TrialEvent:
    objective = objective_of(outcome)
    told = (
        study.tell(trial, state=TrialState.PRUNED)
        if objective is None
        else study.tell(trial, objective)
    )
    return trial_event(study, told)


@dataclass(kw_only=True)
class _Run:
    """Keep the pending evaluations and stop state of one run, not the study's history."""

    study: optuna.Study
    description: StudyDescription
    trials: int
    evaluate: Evaluate
    on_trial: OnTrial
    is_cancelled: IsCancelled
    is_paused: IsPaused
    parallelism: int
    settled: deque[tuple[optuna.Trial, Mapping[str, object]]] = field(
        default_factory=deque, init=False
    )
    in_flight: set[asyncio.Task[None]] = field(default_factory=set, init=False)
    untold: dict[int, optuna.Trial] = field(default_factory=dict, init=False)
    asked: int = field(default=0, init=False)
    cancelled: bool = field(default=False, init=False)
    paused: bool = field(default=False, init=False)

    async def evaluate_trial(self, trial: optuna.Trial, values: dict[str, Scalar]) -> None:
        self.settled.append((trial, await self.evaluate(values)))

    def tell_settled(self) -> None:
        while self.settled:
            trial, outcome = self.settled.popleft()
            # Told before it leaves the cleanup list: an outcome the tell
            # rejects leaves the trial to be failed below, never running.
            event = _tell(self.study, trial, outcome)
            del self.untold[trial.number]
            self.on_trial(event)

    def ask_batch(self) -> None:
        while (
            not self.paused and self.asked < self.trials and len(self.in_flight) < self.parallelism
        ):
            trial = self.study.ask()
            self.untold[trial.number] = trial
            values = suggest(trial, self.description.parameters)
            self.in_flight.add(asyncio.ensure_future(self.evaluate_trial(trial, values)))
            self.asked += 1

    async def drive(self) -> None:
        while self.asked < self.trials or self.in_flight:
            if self.is_cancelled():
                self.cancelled = True
                break
            self.paused = self.paused or self.is_paused()
            self.ask_batch()
            if not self.in_flight:
                break
            done, _ = await asyncio.wait(self.in_flight, return_when=asyncio.FIRST_COMPLETED)
            self.in_flight.difference_update(done)
            for task in done:
                task.result()
            if self.is_cancelled():
                self.cancelled = True
                break
            self.tell_settled()

    async def execute(self) -> RunSummary:
        try:
            await self.drive()
        except BaseException:
            for task in self.in_flight:
                task.cancel()
            raise
        finally:
            if self.in_flight:
                await asyncio.gather(*self.in_flight, return_exceptions=True)
            for trial in self.untold.values():
                trial.set_user_attr(UNREPORTED_ATTR, value=True)
                self.study.tell(trial, state=TrialState.FAIL)
        return {
            **study_summary(self.study),
            "cancelled": self.cancelled,
            "paused": self.paused and not self.cancelled and self.asked < self.trials,
        }


async def run_study(
    study: optuna.Study,
    description: StudyDescription,
    *,
    trials: int,
    evaluate: Evaluate,
    on_trial: OnTrial,
    is_cancelled: IsCancelled = lambda: False,
    is_paused: IsPaused = lambda: False,
    parallelism: int = 1,
) -> RunSummary:
    """Drive `trials` ask/tell rounds and return the study summary.

    The study keeps every trial it is told, so calling this again on the same
    study continues its numbering and its sampler's history, and the summary
    counts every trial the study holds.

    Up to `parallelism` trials are in flight at once, each evaluated in its own
    task; outcomes are told, and `on_trial` called, in completion order.
    Cancellation is polled once before each batch of up to `parallelism` asks
    and once after each wait for an evaluation to settle. A cancelled study
    waits for the evaluations in flight to settle, reports none of them, and
    returns its summary early with `cancelled` set. A pause is polled at the
    same points: a paused study asks no further trial, waits for the
    evaluations in flight to settle, tells and reports every one of them, and
    returns its summary early with `paused` set. Nothing is told failed by a
    pause, so the same study continues from the trials it holds. A pause
    detected once the last trial was asked drains into a plain completion,
    with `paused` unset. An outcome that is neither
    a finite objective nor a pruned marker, and any exception from `evaluate`
    or `on_trial`, ends the study with that error after cancelling the
    evaluations still in flight. Either way, every trial asked and not
    reported is told failed so the sampler gives it no weight, and marked
    unreported so the summary's counters skip it as the events did.
    """
    if trials < 1:
        raise ValueError("an optimization run must ask for at least 1 trial")
    if parallelism < 1:
        raise ValueError("optimization parallelism must be at least 1")

    return await _Run(
        study=study,
        description=description,
        trials=trials,
        evaluate=evaluate,
        on_trial=on_trial,
        is_cancelled=is_cancelled,
        is_paused=is_paused,
        parallelism=parallelism,
    ).execute()
