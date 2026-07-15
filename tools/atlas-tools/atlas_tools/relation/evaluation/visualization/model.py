"""Describe read-only grid status independently of terminal rendering."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

type RunActivity = Literal["ready", "running", "paused", "blocked", "complete"]
type GridPhase = Literal["baseline", "refinement", "canaries", "finalizing", "complete"]
type GridTargetKind = Literal["projected", "exact"]
type GridPhaseName = Literal["baseline", "refinement", "canaries"]


def _require_equal(actual: int, expected: int, message: str) -> None:
    if actual != expected:
        raise ValueError(message)


@dataclass(frozen=True, slots=True, kw_only=True)
class GridPhaseStatus:
    """Measure one ordered phase of fresh grid work."""

    name: GridPhaseName
    completed: int
    committed: int
    total: int
    projected: bool = False

    def __post_init__(self) -> None:
        if min(self.completed, self.committed, self.total) < 0:
            raise ValueError("phase counts must not be negative")
        if self.committed > self.completed or self.completed > self.total:
            raise ValueError("phase progress must satisfy committed <= completed <= total")

    @property
    def progress(self) -> float:
        """Return phase completion as a fraction in [0, 1]."""
        return self.completed / self.total if self.total else 1.0


@dataclass(frozen=True, slots=True, kw_only=True)
class GridFamilyStatus:
    """Summarize one independently paced judge-family stream."""

    family_id: str
    completed: int
    committed: int
    total: int
    rate_per_minute: float
    eta_seconds: float | None
    known_spend_usd: float
    cost_complete: bool
    attempts: int
    repair_attempts: int
    failed_attempts: int
    open_votes: int
    last_activity_at: datetime | None

    def __post_init__(self) -> None:
        if not self.family_id:
            raise ValueError("family_id must not be empty")
        if min(self.completed, self.committed, self.total) < 0:
            raise ValueError("family progress must not be negative")
        if self.committed > self.completed or self.completed > self.total:
            raise ValueError("family progress must satisfy committed <= completed <= total")
        if self.rate_per_minute < 0 or self.known_spend_usd < 0:
            raise ValueError("family rate and spend must not be negative")
        if (
            min(
                self.attempts,
                self.repair_attempts,
                self.failed_attempts,
                self.open_votes,
            )
            < 0
        ):
            raise ValueError("family request counts must not be negative")
        if max(self.repair_attempts, self.failed_attempts, self.open_votes) > self.attempts:
            raise ValueError("family request subsets must not exceed physical attempts")

    @property
    def progress(self) -> float:
        """Return family completion as a fraction in [0, 1]."""
        return self.completed / self.total if self.total else 1.0


@dataclass(frozen=True, slots=True, kw_only=True)
class GridStatusSnapshot:
    """Carry one immutable sample consumed by interactive and static views."""

    run_name: str
    run_path: str
    sampled_at: datetime
    activity: RunActivity
    phase: GridPhase
    target_kind: GridTargetKind
    trigger_rate: float
    pool_cards: int
    refined_cards: int
    completed: int
    committed: int
    total: int
    imported_votes: int
    phases: tuple[GridPhaseStatus, ...]
    families: tuple[GridFamilyStatus, ...]
    known_spend_usd: float
    cost_complete: bool
    physical_attempts: int
    repair_attempts: int
    failed_attempts: int
    awaiting_commit: int
    open_votes: int
    in_flight: int
    elapsed_seconds: float
    eta_seconds: float | None
    projected_finish_at: datetime | None
    last_activity_at: datetime | None

    def __post_init__(self) -> None:
        if not self.run_name or not self.run_path:
            raise ValueError("run identity must not be empty")
        if not 0 <= self.trigger_rate <= 1:
            raise ValueError("trigger_rate must be between zero and one")
        counts = (
            self.pool_cards,
            self.refined_cards,
            self.completed,
            self.committed,
            self.total,
            self.imported_votes,
            self.physical_attempts,
            self.repair_attempts,
            self.failed_attempts,
            self.awaiting_commit,
            self.open_votes,
            self.in_flight,
        )
        if min(counts) < 0:
            raise ValueError("status counts must not be negative")
        if self.committed > self.completed or self.completed > self.total:
            raise ValueError("grid progress must satisfy committed <= completed <= total")
        _require_equal(
            self.awaiting_commit,
            self.completed - self.committed,
            "awaiting commit must equal completed minus committed votes",
        )
        if (
            max(self.repair_attempts, self.failed_attempts, self.open_votes)
            > self.physical_attempts
        ):
            raise ValueError("request subsets must not exceed physical attempts")
        if self.known_spend_usd < 0 or self.elapsed_seconds < 0:
            raise ValueError("spend and elapsed time must not be negative")
        _require_equal(
            sum(phase.completed for phase in self.phases),
            self.completed,
            "phase completion must equal overall completion",
        )
        _require_equal(
            sum(phase.committed for phase in self.phases),
            self.committed,
            "phase commits must equal overall commits",
        )
        _require_equal(
            sum(phase.total for phase in self.phases),
            self.total,
            "phase totals must equal the overall total",
        )
        _require_equal(
            sum(family.completed for family in self.families),
            self.completed,
            "family completion must equal overall completion",
        )
        _require_equal(
            sum(family.committed for family in self.families),
            self.committed,
            "family commits must equal overall commits",
        )
        _require_equal(
            sum(family.total for family in self.families),
            self.total,
            "family totals must equal the overall total",
        )
        _require_equal(
            sum(family.attempts for family in self.families),
            self.physical_attempts,
            "family attempts must equal overall physical attempts",
        )
        _require_equal(
            sum(family.repair_attempts for family in self.families),
            self.repair_attempts,
            "family repairs must equal overall repair attempts",
        )
        _require_equal(
            sum(family.failed_attempts for family in self.families),
            self.failed_attempts,
            "family failures must equal overall failed attempts",
        )
        _require_equal(
            sum(family.open_votes for family in self.families),
            self.open_votes,
            "family open votes must equal overall open votes",
        )

    @property
    def progress(self) -> float:
        """Return overall completion as a fraction in [0, 1]."""
        return self.completed / self.total if self.total else 1.0

    @property
    def realized_trigger_rate(self) -> float:
        """Return the projected or exact refinement share of pool cards."""
        return self.refined_cards / self.pool_cards if self.pool_cards else 0.0
