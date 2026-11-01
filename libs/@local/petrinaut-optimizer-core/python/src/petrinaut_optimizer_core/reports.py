"""Dictionary shapes reported by the optimizer core to its callers."""

from typing import Literal, NotRequired, TypedDict


class BestTrialReport(TypedDict):
    trial: int
    # Optuna can return parameter values wider than the values we suggest.
    parameters: dict[str, object]
    objective: float | None


class ImportanceReport(TypedDict):
    values: dict[str, float]
    completedTrials: int


class TrialEvent(TypedDict):
    trial: int
    parameters: dict[str, object]
    objective: float | None
    state: Literal["complete", "pruned", "failed"]
    best: BestTrialReport | None
    importances: NotRequired[ImportanceReport]


class StudySummary(TypedDict):
    completedTrials: int
    prunedTrials: int
    failedTrials: int
    best: BestTrialReport | None


class RunSummary(StudySummary):
    cancelled: bool
    paused: bool


class BrowserSummary(RunSummary):
    requestedTrials: int
    importances: NotRequired[ImportanceReport]
