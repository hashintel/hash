"""Prove that durable journals form a valid prefix of a replayed plan.

Logical votes must appear in plan order; physical attempts may interleave but
must reference planned votes, use unique IDs, and number each request stage
contiguously from zero. Completed votes are linked back to their successful
physical provider results. Failed attempts for pending votes remain available
to retry policy without turning them into completed work.
"""

from collections import defaultdict
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from types import MappingProxyType

from atlas_tools.common import Sha256Hex
from atlas_tools.relation.evaluation.domain.api import (
    PhysicalAttempt,
    Vote,
    VotePlan,
    VoteTask,
)

type AttemptSequenceValidator = Callable[
    [VoteTask, tuple[PhysicalAttempt, ...], Vote | None],
    None,
]


@dataclass(frozen=True, slots=True, kw_only=True)
class ResumeIndex:
    """Carry the proven commit cursor and prior attempts indexed once by vote."""

    next_plan_index: int
    completed: tuple[Vote, ...]
    attempts_by_vote: Mapping[Sha256Hex, tuple[PhysicalAttempt, ...]]


def _validate_vote(task: VoteTask, vote: Vote, plan_index: int) -> None:
    expected = {
        "vote_id": task.vote_id,
        "relation_id": task.relation_id,
        "card_hash": task.card_hash,
        "family_id": task.judge.family_id,
        "bundle_id": task.bundle_id,
        "rubric_version": task.rubric_version,
        "prompt_pack_hash": task.prompt_pack_hash,
        "effort": task.effort,
        "temperature": task.judge.temperature,
        "seed": task.judge.seed,
        "repeat_index": task.repeat_index,
    }
    observed = {
        "vote_id": vote.vote_id,
        "relation_id": vote.relation_id,
        "card_hash": vote.card_hash,
        "family_id": vote.family_id,
        "bundle_id": vote.bundle_id,
        "rubric_version": vote.rubric_version,
        "prompt_pack_hash": vote.prompt_pack_hash,
        "effort": vote.effort,
        "temperature": vote.temperature,
        "seed": vote.seed,
        "repeat_index": vote.repeat_index,
    }
    if observed != expected:
        differing = sorted(name for name in expected if expected[name] != observed[name])
        raise ValueError(f"vote at plan index {plan_index} differs in fields {differing}")


def _attempt_index(
    attempts: tuple[PhysicalAttempt, ...],
    planned_ids: frozenset[Sha256Hex],
) -> dict[Sha256Hex, tuple[PhysicalAttempt, ...]]:
    seen: set[Sha256Hex] = set()
    grouped: dict[Sha256Hex, list[PhysicalAttempt]] = defaultdict(list)
    for attempt in attempts:
        if attempt.attempt_id in seen:
            raise ValueError(f"attempt journal repeats attempt ID {attempt.attempt_id}")
        seen.add(attempt.attempt_id)
        if attempt.vote_id not in planned_ids:
            raise ValueError(f"attempt {attempt.attempt_id} belongs to an unplanned vote")
        grouped[attempt.vote_id].append(attempt)
    return {vote_id: tuple(rows) for vote_id, rows in grouped.items()}


def _validate_vote_evidence(vote: Vote, attempts: tuple[PhysicalAttempt, ...]) -> None:
    accepted = tuple(
        attempt.attempt_id
        for attempt in attempts
        if attempt.result is not None and attempt.failure is None
    )

    if accepted != vote.accepted_attempt_ids:
        raise ValueError(f"vote {vote.vote_id} does not match successful physical results")


def index_resume(
    plan: VotePlan,
    *,
    votes: tuple[Vote, ...],
    attempts: tuple[PhysicalAttempt, ...],
    validate_attempts: AttemptSequenceValidator,
) -> ResumeIndex:
    """Index a journal only after its caller validates request semantics.

    Storage proves plan membership, unique identities, and the committed vote
    prefix. The injected validator owns request hashes, stage protocol, route
    pins, accounting, and reconstructed logical-vote semantics.

    Raises:
        ValueError: The plan, journal structure, or semantic evidence differs.

    """
    if len(votes) > plan.expected_votes:
        raise ValueError("vote journal is longer than the expected plan")
    tasks = plan.tasks()
    planned_ids: set[Sha256Hex] = set()
    planned_tasks: list[VoteTask] = []
    for plan_index, task in enumerate(tasks):
        if task.vote_id in planned_ids:
            raise ValueError(f"plan repeats logical vote ID {task.vote_id}")

        planned_ids.add(task.vote_id)
        planned_tasks.append(task)

        if plan_index < len(votes):
            _validate_vote(task, votes[plan_index], plan_index)

    if len(planned_ids) != plan.expected_votes:
        raise ValueError(f"plan yields {len(planned_ids)} tasks but declares {plan.expected_votes}")

    by_vote = _attempt_index(attempts, frozenset(planned_ids))
    for plan_index, task in enumerate(planned_tasks):
        vote = votes[plan_index] if plan_index < len(votes) else None
        evidence = by_vote.get(task.vote_id, ())

        if vote is not None:
            if not evidence:
                raise ValueError(f"completed vote {vote.vote_id} has no physical attempts")

            _validate_vote_evidence(vote, evidence)

        if evidence or vote is not None:
            validate_attempts(task, evidence, vote)

    return ResumeIndex(
        next_plan_index=len(votes),
        completed=votes,
        attempts_by_vote=MappingProxyType(by_vote),
    )
