"""Semantic validation and resume planning for durable evaluation journals."""

from collections import defaultdict
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Literal, cast

from openrouter.components import ChatMessages

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.eval.contract import PreparedCards, VotePlan, VoteTask
from atlas_tools.relation.eval.journal import JournalPaths, load_jsonl, recover_inflight
from atlas_tools.relation.eval.prompt import (
    MalformedResponseError,
    build_live_prompt,
    build_retry_prompt,
    parse_response,
)
from atlas_tools.relation.eval.schema import PhysicalAttemptRow, VoteRow
from atlas_tools.relation.eval.transport import (
    accepted_completion,
    aggregate_physical_usage,
    request_hash,
)

type RequestStage = Literal["initial", "repair"]
type AttemptsByStage = dict[RequestStage, list[PhysicalAttemptRow]]


@dataclass(frozen=True)
class PendingVoteWork:
    """One planned but uncommitted vote with durable physical attempts."""

    plan_index: int
    task: VoteTask
    attempts: tuple[PhysicalAttemptRow, ...]


@dataclass
class PendingWork:
    """Validated work after the deterministic committed-vote prefix.

    ``attempted_votes`` is the contiguous pending plan window through the last
    durable attempt. Entries may have no attempts when concurrent execution
    stopped before that lower-index task crossed the paid-request boundary.
    ``take_unstarted_tasks`` returns the remaining plan and may be called once.
    """

    committed_vote_count: int
    attempted_votes: tuple[PendingVoteWork, ...]
    first_unstarted_task: VoteTask | None
    expected_vote_count: int
    _remaining_tasks: Iterator[VoteTask] = field(repr=False)
    _planned_vote_ids: set[Sha256Hex] = field(repr=False)
    _unstarted_claimed: bool = field(default=False, init=False, repr=False)

    @property
    def is_complete(self) -> bool:
        return not self.attempted_votes and self.first_unstarted_task is None

    def take_unstarted_tasks(self) -> Iterator[VoteTask]:
        """Yield a unique remainder whose size matches the declared plan exactly."""
        if self._unstarted_claimed:
            raise RuntimeError("unstarted task stream has already been claimed")
        self._unstarted_claimed = True
        plan_index = self.committed_vote_count + len(self.attempted_votes)
        if self.first_unstarted_task is not None:
            yield self.first_unstarted_task
            plan_index += 1
        for task in self._remaining_tasks:
            if plan_index >= self.expected_vote_count:
                raise ValueError("plan yielded more votes than it declared")
            yield _claim_task(task, self._planned_vote_ids)
            plan_index += 1
        if plan_index != self.expected_vote_count:
            raise ValueError(
                f"plan yielded {plan_index} votes but declared {self.expected_vote_count}"
            )


@dataclass(frozen=True)
class ResumableJournals:
    """Loaded durable rows and their validated pending-work interpretation."""

    votes: list[VoteRow]
    attempts: list[PhysicalAttemptRow]
    pending: PendingWork


@dataclass(frozen=True)
class CompletedJournals:
    votes: list[VoteRow]
    attempts: list[PhysicalAttemptRow]


@dataclass(frozen=True)
class _PendingWindow:
    attempted_votes: tuple[PendingVoteWork, ...]
    first_unstarted_task: VoteTask | None
    next_plan_index: int


def _attempts_by_vote(
    attempts: Sequence[PhysicalAttemptRow],
) -> dict[Sha256Hex, list[PhysicalAttemptRow]]:
    attempt_ids: set[Sha256Hex] = set()
    by_vote: dict[Sha256Hex, list[PhysicalAttemptRow]] = defaultdict(list)
    for attempt in attempts:
        if attempt.attempt_id in attempt_ids:
            raise ValueError(f"attempts.jsonl contains duplicate attempt {attempt.attempt_id}")
        attempt_ids.add(attempt.attempt_id)
        by_vote[attempt.vote_id].append(attempt)
    return by_vote


def _attempts_by_stage(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
) -> AttemptsByStage:
    grouped: AttemptsByStage = {"initial": [], "repair": []}
    for attempt in attempts:
        identity = (
            attempt.vote_id,
            attempt.family_id,
            attempt.provider_slug,
            attempt.model_requested,
        )
        expected = (
            task.vote_id,
            task.judge.family_id,
            task.judge.provider_slug,
            task.judge.model,
        )
        if identity != expected:
            raise ValueError(
                f"attempt {attempt.attempt_id} does not match vote task {task.vote_id}"
            )
        expected_id = sha256_bytes(
            canonical_json_bytes(
                {
                    "request_hash": attempt.request_hash,
                    "stage_attempt": attempt.stage_attempt,
                }
            )
        )
        if attempt.attempt_id != expected_id:
            raise ValueError(f"attempt {attempt.attempt_id} has an invalid deterministic ID")
        grouped[attempt.request_stage].append(attempt)
    return grouped


def _validate_stage_journal(task: VoteTask, grouped: AttemptsByStage) -> None:
    for stage, attempts in grouped.items():
        if [attempt.stage_attempt for attempt in attempts] != list(range(len(attempts))):
            raise ValueError(f"attempts for {task.vote_id}/{stage} are not a contiguous journal")
        successful = [attempt for attempt in attempts if attempt.failure is None]
        if len(successful) > 1:
            raise ValueError(
                f"attempts for {task.vote_id} contain multiple successful {stage} calls"
            )
        if successful and attempts[-1] is not successful[0]:
            raise ValueError(f"attempts for {task.vote_id} continue after successful {stage} call")


def _successful_attempt(
    attempts: Sequence[PhysicalAttemptRow],
    stage: RequestStage,
) -> PhysicalAttemptRow | None:
    successful = [
        attempt
        for attempt in attempts
        if attempt.request_stage == stage and attempt.failure is None
    ]
    if len(successful) > 1:
        raise ValueError(f"attempt journal contains multiple successful {stage} requests")
    return successful[0] if successful else None


def _successful_raw(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    stage: RequestStage,
) -> str | None:
    attempt = _successful_attempt(attempts, stage)
    if attempt is None:
        return None
    if attempt.result is None:
        raise ValueError(f"successful {stage} attempt for {task.vote_id} has no result")
    return accepted_completion(attempt.result, task.judge).content


def _task_messages(task: VoteTask, prepared: PreparedCards) -> list[ChatMessages]:
    framing = cast("Literal[1, 2, 3]", int(task.bundle_id[-1]))
    return build_live_prompt(
        prepared.prefixes[task.bundle_id],
        framing=framing,
        card_text=prepared.cards[task.relation_id].card_text,
    )


def _validate_vote_task(vote: VoteRow, task: VoteTask) -> None:
    shell_id, framing_id = task.bundle_id.split("x")
    expected = {
        "bundle_id": task.bundle_id,
        "card_hash": task.card_hash,
        "effort": task.effort,
        "family_id": task.judge.family_id,
        "framing_id": framing_id,
        "prompt_pack_hash": task.pack_hash,
        "relation_id": task.relation_id,
        "repeat_index": task.repeat_index,
        "rubric_version": task.rubric_version,
        "seed": task.judge.seed,
        "shell_id": shell_id,
        "temperature": task.judge.temperature,
        "vote_id": task.vote_id,
    }
    mismatches = [
        field_name
        for field_name, expected_value in expected.items()
        if getattr(vote, field_name) != expected_value
    ]
    if mismatches:
        raise ValueError(f"vote {vote.vote_id} does not match its task fields: {mismatches}")
    if vote.model_returned != task.judge.model or vote.provider != task.judge.provider_name:
        raise ValueError(f"vote {vote.vote_id} does not match its model/provider pin")


def _validate_request_hashes(
    task: VoteTask,
    grouped: AttemptsByStage,
    prepared: PreparedCards,
    timeout: timedelta,
) -> None:
    messages = _task_messages(task, prepared)
    initial_hash = request_hash(messages, task, "initial", timeout)
    if any(attempt.request_hash != initial_hash for attempt in grouped["initial"]):
        raise ValueError(f"initial request hash mismatch for {task.vote_id}")
    if not grouped["repair"]:
        return

    initial_raw = _successful_raw(task, grouped["initial"], "initial")
    if initial_raw is None:
        raise ValueError(f"repair attempts for {task.vote_id} lack a successful initial call")
    try:
        parse_response(initial_raw)
    except MalformedResponseError:
        pass
    else:
        raise ValueError(f"repair attempts for {task.vote_id} follow a valid initial response")
    repair_hash = request_hash(build_retry_prompt(messages, initial_raw), task, "repair", timeout)
    if any(attempt.request_hash != repair_hash for attempt in grouped["repair"]):
        raise ValueError(f"repair request hash mismatch for {task.vote_id}")


def _validate_attempt_outcomes(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
) -> None:
    for attempt in attempts:
        if attempt.result is None:
            continue
        try:
            accepted_completion(attempt.result, task.judge)
        except ValueError:
            if attempt.failure is None:
                raise ValueError(
                    f"attempt {attempt.attempt_id} stores a rejected result as successful"
                ) from None
        else:
            if attempt.failure is not None:
                raise ValueError(
                    f"attempt {attempt.attempt_id} stores a valid result with a failure"
                )


def _validate_vote_accounting(
    vote: VoteRow,
    attempts: Sequence[PhysicalAttemptRow],
) -> None:
    expected = aggregate_physical_usage(attempts)
    recorded = (
        vote.tokens_in,
        vote.tokens_out,
        vote.tokens_cached,
        vote.tokens_cache_write,
        vote.tokens_reasoning,
        vote.known_cost_usd,
        vote.cost_complete,
        vote.cost_usd,
    )
    calculated = (
        expected.tokens_in,
        expected.tokens_out,
        expected.tokens_cached,
        expected.tokens_cache_write,
        expected.tokens_reasoning,
        expected.known_cost_usd,
        expected.cost_complete,
        expected.cost_usd,
    )
    if recorded != calculated:
        raise ValueError(f"vote {vote.vote_id} accounting does not match attempts.jsonl")


def _validate_vote_timing(vote: VoteRow, attempts: Sequence[PhysicalAttemptRow]) -> None:
    if vote.ts_request != min(attempt.ts_request for attempt in attempts):
        raise ValueError(f"vote {vote.vote_id} ts_request does not match attempts.jsonl")
    if vote.ts_response != max(attempt.ts_response for attempt in attempts):
        raise ValueError(f"vote {vote.vote_id} ts_response does not match attempts.jsonl")
    expected_latency = sum((attempt.latency for attempt in attempts), start=timedelta())
    if vote.latency != expected_latency:
        raise ValueError(f"vote {vote.vote_id} latency does not match attempts.jsonl")


def _validate_completed_vote(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    vote: VoteRow,
) -> None:
    _validate_vote_task(vote, task)
    successful_results = [
        attempt.result
        for attempt in attempts
        if attempt.failure is None and attempt.result is not None
    ]
    if successful_results != vote.attempt_results:
        raise ValueError(f"vote {vote.vote_id} native results do not match attempts.jsonl")
    if len(successful_results) != vote.parse_retries + 1:
        raise ValueError(f"vote {vote.vote_id} parse retry count does not match attempts.jsonl")
    _validate_vote_accounting(vote, attempts)
    _validate_vote_timing(vote, attempts)


def validate_attempt_sequence(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    prepared: PreparedCards,
    timeout: timedelta,
    vote: VoteRow | None,
) -> None:
    grouped = _attempts_by_stage(task, attempts)
    _validate_stage_journal(task, grouped)
    _validate_request_hashes(task, grouped, prepared, timeout)
    _validate_attempt_outcomes(task, attempts)
    if vote is not None:
        _validate_completed_vote(task, attempts, vote)


def _claim_task(task: VoteTask, planned_ids: set[Sha256Hex]) -> VoteTask:
    if task.vote_id in planned_ids:
        raise ValueError(f"requested plan contains duplicate vote {task.vote_id}")
    planned_ids.add(task.vote_id)
    return task


def _validate_committed_prefix(
    *,
    tasks: Iterator[VoteTask],
    votes: Sequence[VoteRow],
    by_vote: dict[Sha256Hex, list[PhysicalAttemptRow]],
    prepared: PreparedCards,
    timeout: timedelta,
    expected_votes: int,
    planned_ids: set[Sha256Hex],
) -> None:
    if len(votes) > expected_votes:
        raise ValueError("votes.jsonl extends beyond the declared plan size")
    for vote in votes:
        try:
            task = _claim_task(next(tasks), planned_ids)
        except StopIteration as error:
            raise ValueError("votes.jsonl contains more votes than the requested plan") from error
        if vote.vote_id != task.vote_id:
            raise ValueError("votes.jsonl is not a valid prefix of the requested plan")
        task_attempts = by_vote.pop(vote.vote_id, [])
        if not task_attempts:
            raise ValueError(f"vote {vote.vote_id} has no physical attempt evidence")
        validate_attempt_sequence(task, task_attempts, prepared, timeout, vote)


def _validate_pending_window(
    *,
    tasks: Iterator[VoteTask],
    start_index: int,
    by_vote: dict[Sha256Hex, list[PhysicalAttemptRow]],
    prepared: PreparedCards,
    timeout: timedelta,
    planned_ids: set[Sha256Hex],
) -> _PendingWindow:
    pending: list[PendingVoteWork] = []
    plan_index = start_index
    first_unstarted: VoteTask | None = None
    while True:
        try:
            task = _claim_task(next(tasks), planned_ids)
        except StopIteration:
            break
        task_attempts = by_vote.pop(task.vote_id, None)
        if task_attempts is None and not by_vote:
            first_unstarted = task
            break
        if task_attempts is not None:
            validate_attempt_sequence(task, task_attempts, prepared, timeout, None)
        pending.append(
            PendingVoteWork(
                plan_index=plan_index,
                task=task,
                attempts=tuple(task_attempts or ()),
            )
        )
        plan_index += 1
    if by_vote:
        raise ValueError("attempts.jsonl contains attempts beyond the requested plan")
    return _PendingWindow(
        attempted_votes=tuple(pending),
        first_unstarted_task=first_unstarted,
        next_plan_index=plan_index,
    )


def validate_resume(
    *,
    plan: VotePlan,
    votes: Sequence[VoteRow],
    attempts: Sequence[PhysicalAttemptRow],
    prepared: PreparedCards,
    timeout: timedelta,
) -> PendingWork:
    """Validate a vote prefix plus a contiguous attempted-but-uncommitted window."""
    tasks = plan.tasks()
    by_vote = _attempts_by_vote(attempts)
    planned_ids: set[Sha256Hex] = set()
    _validate_committed_prefix(
        tasks=tasks,
        votes=votes,
        by_vote=by_vote,
        prepared=prepared,
        timeout=timeout,
        expected_votes=plan.expected_votes,
        planned_ids=planned_ids,
    )
    window = _validate_pending_window(
        tasks=tasks,
        start_index=len(votes),
        by_vote=by_vote,
        prepared=prepared,
        timeout=timeout,
        planned_ids=planned_ids,
    )
    if window.next_plan_index > plan.expected_votes or (
        window.first_unstarted_task is not None and window.next_plan_index >= plan.expected_votes
    ):
        raise ValueError("durable journals extend beyond the declared plan size")
    if window.first_unstarted_task is None and window.next_plan_index != plan.expected_votes:
        raise ValueError(
            f"plan yielded {window.next_plan_index} votes but declared {plan.expected_votes}"
        )
    return PendingWork(
        committed_vote_count=len(votes),
        attempted_votes=window.attempted_votes,
        first_unstarted_task=window.first_unstarted_task,
        expected_vote_count=plan.expected_votes,
        _remaining_tasks=tasks,
        _planned_vote_ids=planned_ids,
    )


def load_resumable_journals(
    *,
    paths: JournalPaths,
    prepared: PreparedCards,
    plan: VotePlan,
    timeout: timedelta,
) -> ResumableJournals:
    votes = load_jsonl(paths.votes_jsonl, VoteRow)
    attempts = load_jsonl(paths.attempts_jsonl, PhysicalAttemptRow)
    recover_inflight(paths.inflight_dir, attempts)
    pending = validate_resume(
        plan=plan,
        votes=votes,
        attempts=attempts,
        prepared=prepared,
        timeout=timeout,
    )
    return ResumableJournals(votes=votes, attempts=attempts, pending=pending)


def validate_completed_journals(
    *,
    paths: JournalPaths,
    prepared: PreparedCards,
    plan: VotePlan,
    timeout: timedelta,
) -> CompletedJournals:
    journals = load_resumable_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=timeout,
    )
    if not journals.pending.is_complete or len(journals.votes) != plan.expected_votes:
        raise ValueError("completed output journals do not contain the complete requested plan")
    return CompletedJournals(votes=journals.votes, attempts=journals.attempts)
