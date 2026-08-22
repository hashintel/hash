"""Read append-only grid journals into stable operator status snapshots."""

import fcntl
from collections import Counter, defaultdict
from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import fsum
from pathlib import Path

from pydantic import BaseModel, ValidationError

from atlas_tools.relation.evaluation.domain.api import (
    BASELINE_REPEAT_INDEX,
    CANARY_REPEAT_INDEX,
    REFINEMENT_REPEAT_INDICES,
    AcceptedAttempt,
    CorpusRecord,
    GridRunState,
    PhysicalAttempt,
    Vote,
    VoteId,
    VoteVerdict,
)
from atlas_tools.relation.evaluation.modes.api import parse_response, refinement_trigger
from atlas_tools.relation.evaluation.storage.api import GridPaths, load_json, load_jsonl
from atlas_tools.relation.evaluation.visualization.model import (
    GridFamilyStatus,
    GridPhase,
    GridPhaseStatus,
    GridStatusSnapshot,
    RunActivity,
)

DEFAULT_TRIGGER_RATE = 0.40
IDLE_GAP = timedelta(minutes=10)


class _JsonlTail[RowT: BaseModel]:
    """Validate only complete rows appended after the previous read."""

    __slots__ = ("_line_number", "_model", "_offset", "_path")

    def __init__(self, path: Path, model: type[RowT]) -> None:
        self._path = path
        self._model = model
        self._offset = 0
        self._line_number = 0

    def read(self) -> tuple[RowT, ...]:
        size = self._path.stat().st_size
        if size < self._offset:
            raise ValueError(f"append-only journal was truncated: {self._path}")

        with self._path.open("rb") as input_file:
            input_file.seek(self._offset)
            payload = input_file.read()
        boundary = payload.rfind(b"\n")
        if boundary < 0:
            return ()

        complete = payload[: boundary + 1]
        line_number = self._line_number
        rows: list[RowT] = []
        for line in complete.split(b"\n")[:-1]:
            line_number += 1
            if not line.strip():
                continue
            try:
                rows.append(self._model.model_validate_json(line, strict=True))
            except ValidationError as error:
                raise ValueError(
                    f"invalid {self._path.name} line {line_number}: {error}"
                ) from error

        self._offset += len(complete)
        self._line_number = line_number
        return tuple(rows)


@dataclass(frozen=True, slots=True, kw_only=True)
class _GridInputs:
    state: GridRunState
    corpus: tuple[CorpusRecord, ...]
    imported_votes: tuple[Vote, ...]
    imported_attempts: tuple[PhysicalAttempt, ...]


def _utc_now() -> datetime:
    return datetime.now(UTC)


class GridStatusReader:
    """Lazily load immutable inputs and incrementally tail mutable journals."""

    __slots__ = (
        "_attempt_tail",
        "_attempts",
        "_inputs",
        "_now",
        "_paths",
        "_run_directory",
        "_trigger_rate",
        "_vote_tail",
        "_votes",
    )

    def __init__(
        self,
        run_directory: Path,
        *,
        trigger_rate: float = DEFAULT_TRIGGER_RATE,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if not 0 <= trigger_rate <= 1:
            raise ValueError("trigger_rate must be between zero and one")
        self._run_directory = run_directory
        self._paths = GridPaths.under(run_directory)
        self._trigger_rate = trigger_rate
        self._now = now if now is not None else _utc_now
        self._inputs: _GridInputs | None = None
        self._attempt_tail: _JsonlTail[PhysicalAttempt] | None = None
        self._vote_tail: _JsonlTail[Vote] | None = None
        self._attempts: list[PhysicalAttempt] = []
        self._votes: list[Vote] = []

    def _initialize(self) -> _GridInputs:
        if self._inputs is not None:
            return self._inputs
        inputs = _GridInputs(
            state=load_json(self._paths.state, GridRunState),
            corpus=load_jsonl(self._paths.corpus, CorpusRecord),
            imported_votes=load_jsonl(self._paths.imported_votes, Vote),
            imported_attempts=load_jsonl(self._paths.imported_attempts, PhysicalAttempt),
        )
        self._inputs = inputs
        self._attempt_tail = _JsonlTail(self._paths.journal.attempts, PhysicalAttempt)
        self._vote_tail = _JsonlTail(self._paths.journal.votes, Vote)
        return inputs

    def snapshot(self) -> GridStatusSnapshot:
        """Read one mutually monotone status sample from the durable run."""
        inputs = self._initialize()
        if self._attempt_tail is None or self._vote_tail is None:
            raise RuntimeError("grid status reader did not initialize its journals")
        self._attempts.extend(self._attempt_tail.read())
        self._votes.extend(self._vote_tail.read())
        return calculate_grid_status(
            run_name=self._run_directory.name,
            run_path=str(self._run_directory),
            now=self._now(),
            state=inputs.state,
            corpus=inputs.corpus,
            imported_votes=inputs.imported_votes,
            imported_attempts=inputs.imported_attempts,
            votes=self._votes,
            attempts=self._attempts,
            run_active=_run_active(self._paths.journal.lock),
            manifest_exists=self._paths.manifest.is_file(),
            in_flight=_in_flight_count(self._paths.journal.inflight),
            trigger_rate=self._trigger_rate,
        )


def _run_active(lock_path: Path) -> bool:
    if not lock_path.is_file():
        return False
    with lock_path.open("rb") as lock_file:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    return False


def _in_flight_count(directory: Path) -> int:
    if not directory.is_dir():
        return 0
    return sum(1 for path in directory.glob("*.json") if path.is_file())


def _families(
    imported_votes: Sequence[Vote],
    imported_attempts: Sequence[PhysicalAttempt],
    votes: Sequence[Vote],
    attempts: Sequence[PhysicalAttempt],
) -> tuple[str, ...]:
    seated = {
        *(str(vote.family_id) for vote in imported_votes),
        *(str(attempt.family_id) for attempt in imported_attempts),
    }
    if not seated:
        seated.update(str(vote.family_id) for vote in votes)
        seated.update(str(attempt.family_id) for attempt in attempts)
    if not seated:
        raise ValueError("grid status cannot identify any seated judge families")

    observed = {
        *(str(vote.family_id) for vote in votes),
        *(str(attempt.family_id) for attempt in attempts),
    }
    unexpected = sorted(observed - seated)
    if unexpected:
        raise ValueError(f"fresh journals contain unseated families: {unexpected}")
    return tuple(sorted(seated))


def _exact_refined_cards(
    *,
    pool_cards: int,
    families: tuple[str, ...],
    imported_votes: Sequence[Vote],
    votes: Sequence[Vote],
) -> int | None:
    cells: dict[tuple[str, str], Vote] = {}
    for vote in (*imported_votes, *(row for row in votes if row.repeat_index == 0)):
        if vote.repeat_index != BASELINE_REPEAT_INDEX:
            raise ValueError("imported grid votes must belong to the baseline")
        key = (str(vote.relation_id), str(vote.family_id))
        previous = cells.get(key)
        if previous is not None and previous.vote_id != vote.vote_id:
            raise ValueError(f"baseline cell appears more than once: {key}")
        cells[key] = vote

    expected_cells = pool_cards * len(families)
    if len(cells) < expected_cells:
        return None
    if len(cells) > expected_cells:
        raise ValueError("baseline contains more cells than the grid run state permits")

    by_relation: defaultdict[str, dict[str, Vote]] = defaultdict(dict)
    for (relation_id, family_id), vote in cells.items():
        by_relation[relation_id][family_id] = vote
    if len(by_relation) != pool_cards:
        raise ValueError("complete baseline does not cover exactly the configured pool")

    refined = 0
    expected_families = set(families)
    for relation_id, by_family in by_relation.items():
        if set(by_family) != expected_families:
            raise ValueError(f"baseline relation {relation_id} does not cover every family")
        verdicts: tuple[VoteVerdict, ...] = tuple(by_family[family].verdict for family in families)
        refined += refinement_trigger(verdicts)
    return refined


def latest_rate(
    attempts: Sequence[PhysicalAttempt],
    *,
    completed_vote_ids: Collection[VoteId] | None = None,
    idle_gap: timedelta = IDLE_GAP,
) -> float:
    """Return accepted logical votes per second in the latest active segment."""
    ordered = sorted(attempts, key=lambda attempt: attempt.request_at)
    if not ordered:
        return 0.0

    segment_start = 0
    segment_end = ordered[0].response_at
    for index, attempt in enumerate(ordered[1:], start=1):
        if attempt.request_at - segment_end > idle_gap:
            segment_start = index
            segment_end = attempt.response_at
        else:
            segment_end = max(segment_end, attempt.response_at)

    segment = ordered[segment_start:]
    completed = {
        attempt.vote_id
        for attempt in segment
        if (
            attempt.vote_id in completed_vote_ids
            if completed_vote_ids is not None
            else isinstance(attempt.outcome, AcceptedAttempt)
        )
    }
    elapsed = (
        max(attempt.response_at for attempt in segment)
        - min(attempt.request_at for attempt in segment)
    ).total_seconds()
    return len(completed) / elapsed if elapsed > 0 else 0.0


def _attempt_cost(attempt: PhysicalAttempt) -> tuple[float, bool]:
    result = attempt.result
    if result is None or result.usage is None or result.usage.cost_usd is None:
        return 0.0, False
    return result.usage.cost_usd, True


def _activity(
    *,
    manifest_exists: bool,
    run_active: bool,
    in_flight: int,
    attempts: Sequence[PhysicalAttempt],
) -> RunActivity:
    if manifest_exists:
        return "complete"
    if in_flight and not run_active:
        return "blocked"
    if run_active:
        return "running"
    if not attempts:
        return "ready"
    return "paused"


def _phase(
    *,
    manifest_exists: bool,
    baseline: GridPhaseStatus,
    refinement: GridPhaseStatus,
    canaries: GridPhaseStatus,
) -> GridPhase:
    if manifest_exists:
        return "complete"
    if baseline.committed < baseline.total:
        return "baseline"
    if refinement.committed < refinement.total:
        return "refinement"
    if canaries.committed < canaries.total:
        return "canaries"
    return "finalizing"


@dataclass(frozen=True, slots=True, kw_only=True)
class _LogicalProgress:
    completed_vote_ids: frozenset[VoteId]
    ready_by_family: Counter[str]
    open_by_family: Counter[str]
    repairs_by_family: Counter[str]
    failures_by_family: Counter[str]

    @property
    def awaiting_commit(self) -> int:
        return sum(self.ready_by_family.values())

    @property
    def open_votes(self) -> int:
        return sum(self.open_by_family.values())


def _accepted_stage(
    attempts: Sequence[PhysicalAttempt],
    stage: str,
) -> PhysicalAttempt | None:
    return next(
        (
            attempt
            for attempt in attempts
            if attempt.request_stage == stage and isinstance(attempt.outcome, AcceptedAttempt)
        ),
        None,
    )


def _parses_as_vote(attempt: PhysicalAttempt) -> bool:
    result = attempt.result
    content = result.content if result is not None else None
    if content is None:
        return False
    try:
        parse_response(content)
    except ValueError:
        return False
    return True


def _logical_progress(
    votes: Sequence[Vote],
    attempts: Sequence[PhysicalAttempt],
) -> _LogicalProgress:
    committed = frozenset(vote.vote_id for vote in votes)
    by_vote: defaultdict[VoteId, list[PhysicalAttempt]] = defaultdict(list)
    repairs_by_family: Counter[str] = Counter()
    failures_by_family: Counter[str] = Counter()
    for attempt in attempts:
        family = str(attempt.family_id)
        by_vote[attempt.vote_id].append(attempt)
        repairs_by_family[family] += attempt.request_stage == "repair"
        failures_by_family[family] += not isinstance(attempt.outcome, AcceptedAttempt)

    completed = set(committed)
    ready_by_family: Counter[str] = Counter()
    open_by_family: Counter[str] = Counter()
    for vote_id, vote_attempts in by_vote.items():
        if vote_id in committed:
            continue
        families = {str(attempt.family_id) for attempt in vote_attempts}
        if len(families) != 1:
            raise ValueError(f"attempts for vote {vote_id} disagree on judge family")
        family = next(iter(families))
        initial = _accepted_stage(vote_attempts, "initial")
        repair = _accepted_stage(vote_attempts, "repair")
        if initial is not None and (_parses_as_vote(initial) or repair is not None):
            completed.add(vote_id)
            ready_by_family[family] += 1
        else:
            open_by_family[family] += 1
    return _LogicalProgress(
        completed_vote_ids=frozenset(completed),
        ready_by_family=ready_by_family,
        open_by_family=open_by_family,
        repairs_by_family=repairs_by_family,
        failures_by_family=failures_by_family,
    )


@dataclass(frozen=True, slots=True, kw_only=True)
class _ProgressPlan:
    phases: tuple[GridPhaseStatus, ...]
    baseline_by_family: dict[str, int]
    holdouts: int
    refined_cards: int
    projected: bool


def _progress_plan(
    *,
    state: GridRunState,
    corpus: Sequence[CorpusRecord],
    families: tuple[str, ...],
    imported_votes: Sequence[Vote],
    votes: Sequence[Vote],
    trigger_rate: float,
    awaiting_commit: int,
) -> _ProgressPlan:
    imported_by_family = Counter(str(vote.family_id) for vote in imported_votes)
    baseline_by_family = {
        family: state.pool_cards - imported_by_family[family] for family in families
    }
    invalid = sorted(family for family, total in baseline_by_family.items() if total < 0)
    if invalid:
        raise ValueError(f"families import more votes than the grid pool: {invalid}")

    repeat_indices = {
        BASELINE_REPEAT_INDEX,
        *REFINEMENT_REPEAT_INDICES,
        CANARY_REPEAT_INDEX,
    }
    unexpected_repeats = sorted({vote.repeat_index for vote in votes} - repeat_indices)
    if unexpected_repeats:
        raise ValueError(f"fresh grid votes contain unknown repeat indices: {unexpected_repeats}")

    exact_refined = _exact_refined_cards(
        pool_cards=state.pool_cards,
        families=families,
        imported_votes=imported_votes,
        votes=votes,
    )
    projected = exact_refined is None
    refined_cards = (
        round(state.pool_cards * trigger_rate) if exact_refined is None else exact_refined
    )
    holdouts = sum(record.is_holdout for record in corpus)
    phases = (
        GridPhaseStatus(
            name="baseline",
            completed=sum(vote.repeat_index == BASELINE_REPEAT_INDEX for vote in votes),
            committed=sum(vote.repeat_index == BASELINE_REPEAT_INDEX for vote in votes),
            total=sum(baseline_by_family.values()),
        ),
        GridPhaseStatus(
            name="refinement",
            completed=sum(vote.repeat_index in REFINEMENT_REPEAT_INDICES for vote in votes),
            committed=sum(vote.repeat_index in REFINEMENT_REPEAT_INDICES for vote in votes),
            total=refined_cards * len(families) * len(REFINEMENT_REPEAT_INDICES),
            projected=projected,
        ),
        GridPhaseStatus(
            name="canaries",
            completed=sum(vote.repeat_index == CANARY_REPEAT_INDEX for vote in votes),
            committed=sum(vote.repeat_index == CANARY_REPEAT_INDEX for vote in votes),
            total=holdouts * len(families),
        ),
    )
    incomplete = next(
        (index for index, phase in enumerate(phases) if phase.committed < phase.total), None
    )
    if awaiting_commit:
        if incomplete is None:
            raise ValueError("completed uncommitted votes exceed the available grid plan")
        active = phases[incomplete]
        if awaiting_commit > active.total - active.completed:
            raise ValueError("completed uncommitted votes exceed the active phase")
        phases = tuple(
            GridPhaseStatus(
                name=phase.name,
                completed=phase.completed + awaiting_commit
                if index == incomplete
                else phase.completed,
                committed=phase.committed,
                total=phase.total,
                projected=phase.projected,
            )
            for index, phase in enumerate(phases)
        )
    return _ProgressPlan(
        phases=phases,
        baseline_by_family=baseline_by_family,
        holdouts=holdouts,
        refined_cards=refined_cards,
        projected=projected,
    )


def _family_statuses(
    *,
    families: tuple[str, ...],
    progress: _ProgressPlan,
    votes: Sequence[Vote],
    attempts: Sequence[PhysicalAttempt],
    logical: _LogicalProgress,
) -> tuple[GridFamilyStatus, ...]:
    votes_by_family = Counter(str(vote.family_id) for vote in votes)
    attempts_by_family: defaultdict[str, list[PhysicalAttempt]] = defaultdict(list)
    for attempt in attempts:
        attempts_by_family[str(attempt.family_id)].append(attempt)

    rows: list[GridFamilyStatus] = []
    for family in families:
        family_attempts = attempts_by_family[family]
        committed = votes_by_family[family]
        completed = committed + logical.ready_by_family[family]
        total = (
            progress.baseline_by_family[family]
            + progress.refined_cards * len(REFINEMENT_REPEAT_INDICES)
            + progress.holdouts
        )
        rate_per_second = latest_rate(
            family_attempts,
            completed_vote_ids=logical.completed_vote_ids,
        )
        remaining = max(total - completed, 0)
        costs = tuple(_attempt_cost(attempt) for attempt in family_attempts)
        rows.append(
            GridFamilyStatus(
                family_id=family,
                completed=completed,
                committed=committed,
                total=total,
                rate_per_minute=rate_per_second * 60,
                eta_seconds=remaining / rate_per_second if remaining and rate_per_second else None,
                known_spend_usd=fsum(cost for cost, _complete in costs),
                cost_complete=all(complete for _cost, complete in costs),
                attempts=len(family_attempts),
                repair_attempts=logical.repairs_by_family[family],
                failed_attempts=logical.failures_by_family[family],
                open_votes=logical.open_by_family[family],
                last_activity_at=max(
                    (attempt.response_at for attempt in family_attempts),
                    default=None,
                ),
            )
        )
    return tuple(rows)


def _slowest_eta(families: Sequence[GridFamilyStatus]) -> float | None:
    pending = [row.eta_seconds for row in families if row.completed < row.total]
    if not pending:
        return 0.0
    if any(eta is None for eta in pending):
        return None
    return max(eta for eta in pending if eta is not None)


def _elapsed_seconds(
    *,
    now: datetime,
    last_activity_at: datetime | None,
    attempts: Sequence[PhysicalAttempt],
    manifest_exists: bool,
) -> float:
    if not attempts:
        return 0.0
    started_at = min(attempt.request_at for attempt in attempts)
    ended_at = last_activity_at if manifest_exists and last_activity_at is not None else now
    return max((ended_at - started_at).total_seconds(), 0.0)


def calculate_grid_status(
    *,
    run_name: str,
    run_path: str,
    now: datetime,
    state: GridRunState,
    corpus: Sequence[CorpusRecord],
    imported_votes: Sequence[Vote],
    imported_attempts: Sequence[PhysicalAttempt],
    votes: Sequence[Vote],
    attempts: Sequence[PhysicalAttempt],
    run_active: bool,
    manifest_exists: bool,
    in_flight: int,
    trigger_rate: float = DEFAULT_TRIGGER_RATE,
) -> GridStatusSnapshot:
    """Derive exact progress where durable evidence permits, otherwise project."""
    if not 0 <= trigger_rate <= 1:
        raise ValueError("trigger_rate must be between zero and one")
    families = _families(imported_votes, imported_attempts, votes, attempts)
    logical = _logical_progress(votes, attempts)
    progress = _progress_plan(
        state=state,
        corpus=corpus,
        families=families,
        imported_votes=imported_votes,
        votes=votes,
        trigger_rate=trigger_rate,
        awaiting_commit=logical.awaiting_commit,
    )
    family_rows = _family_statuses(
        families=families,
        progress=progress,
        votes=votes,
        attempts=attempts,
        logical=logical,
    )
    completed = len(logical.completed_vote_ids)
    committed = len(votes)
    total = sum(phase.total for phase in progress.phases)
    eta_seconds = _slowest_eta(family_rows)
    costs = tuple(_attempt_cost(attempt) for attempt in attempts)
    last_activity_at = max((attempt.response_at for attempt in attempts), default=None)
    activity = _activity(
        manifest_exists=manifest_exists,
        run_active=run_active,
        in_flight=in_flight,
        attempts=attempts,
    )

    return GridStatusSnapshot(
        run_name=run_name,
        run_path=run_path,
        sampled_at=now,
        activity=activity,
        phase=_phase(
            manifest_exists=manifest_exists,
            baseline=progress.phases[0],
            refinement=progress.phases[1],
            canaries=progress.phases[2],
        ),
        target_kind="projected" if progress.projected else "exact",
        trigger_rate=trigger_rate,
        pool_cards=state.pool_cards,
        refined_cards=progress.refined_cards,
        completed=completed,
        committed=committed,
        total=total,
        imported_votes=len(imported_votes),
        phases=progress.phases,
        families=family_rows,
        known_spend_usd=fsum(cost for cost, _complete in costs),
        cost_complete=all(complete for _cost, complete in costs),
        physical_attempts=len(attempts),
        repair_attempts=sum(logical.repairs_by_family.values()),
        failed_attempts=sum(logical.failures_by_family.values()),
        awaiting_commit=logical.awaiting_commit,
        open_votes=logical.open_votes,
        in_flight=in_flight,
        elapsed_seconds=_elapsed_seconds(
            now=now,
            last_activity_at=last_activity_at,
            attempts=attempts,
            manifest_exists=manifest_exists,
        ),
        eta_seconds=eta_seconds,
        projected_finish_at=(now + timedelta(seconds=eta_seconds) if eta_seconds else None),
        last_activity_at=last_activity_at,
    )
