"""Validate durable request evidence before any result is reused."""

from collections.abc import Sequence
from contextlib import suppress
from dataclasses import dataclass

from atlas_tools.relation.evaluation.domain.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    COMPLETION_REQUEST_POLICY_IDS,
    BaseRunConfig,
    CompletionRequestPolicyId,
    HistoricalCompletionRequestPolicyId,
    PhysicalAttempt,
    RequestHash,
    RequestStage,
    Vote,
    VotePlan,
    VoteTask,
    attempt_id,
)
from atlas_tools.relation.evaluation.execution.vote import (
    VotePrompt,
    _build_vote,
    _completion_request,
)
from atlas_tools.relation.evaluation.storage.api import ResumeIndex, index_resume
from atlas_tools.relation.evaluation.transport.api import (
    CompletionRequest,
    matches_pinned_route,
    request_hash,
)

type _AttemptsByStage = dict[RequestStage, tuple[PhysicalAttempt, ...]]


@dataclass(frozen=True, slots=True, kw_only=True)
class _ReconstructedRequestSequence:
    initial: CompletionRequest
    repair: CompletionRequest | None
    initial_raw: str | None
    repair_raw: str | None


def _allowed_request_hashes(
    request: CompletionRequest,
    *,
    task: VoteTask,
    stage: RequestStage,
    historical_request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...],
) -> frozenset[RequestHash]:
    policy_ids: tuple[CompletionRequestPolicyId, ...] = (
        *historical_request_policy_ids,
        ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    )
    return frozenset(
        request_hash(
            request,
            vote_id=task.vote_id,
            stage=stage,
            policy_id=policy_id,
        )
        for policy_id in policy_ids
    )


def _group_attempts(
    task: VoteTask,
    attempts: Sequence[PhysicalAttempt],
) -> _AttemptsByStage:
    grouped: dict[RequestStage, list[PhysicalAttempt]] = {"initial": [], "repair": []}
    repair_seen = False
    for attempt in attempts:
        expected_envelope = (
            task.vote_id,
            task.judge.family_id,
            task.judge.provider_slug,
            task.judge.model,
        )
        observed_envelope = (
            attempt.vote_id,
            attempt.family_id,
            attempt.provider_slug,
            attempt.model_requested,
        )
        if observed_envelope != expected_envelope:
            raise ValueError(f"attempt {attempt.attempt_id} differs from its planned request")
        expected_id = attempt_id(
            request_hash=attempt.request_hash,
            stage_attempt=attempt.stage_attempt,
        )
        if attempt.attempt_id != expected_id:
            raise ValueError(f"attempt {attempt.attempt_id} has an invalid deterministic ID")
        if attempt.request_stage == "repair":
            repair_seen = True
        elif repair_seen:
            raise ValueError(f"vote {task.vote_id} resumes the initial stage after repair")
        grouped[attempt.request_stage].append(attempt)

    result: _AttemptsByStage = {stage: tuple(rows) for stage, rows in grouped.items()}
    for stage, rows in result.items():
        observed_indices = tuple(row.stage_attempt for row in rows)
        if observed_indices != tuple(range(len(rows))):
            raise ValueError(f"attempts for {task.vote_id}/{stage} are not contiguous from zero")
        successful = tuple(row for row in rows if row.failure is None)
        if len(successful) > 1:
            raise ValueError(f"vote {task.vote_id} has multiple successful {stage} calls")
        if successful and rows[-1] is not successful[0]:
            raise ValueError(f"vote {task.vote_id} continues after a successful {stage} call")
    return result


def _successful(
    grouped: _AttemptsByStage,
    stage: RequestStage,
) -> PhysicalAttempt | None:
    return next((attempt for attempt in grouped[stage] if attempt.failure is None), None)


def _accepted_content(task: VoteTask, attempt: PhysicalAttempt) -> str:
    result = attempt.result
    if attempt.failure is not None or result is None:
        raise ValueError(f"attempt {attempt.attempt_id} is not an accepted completion")
    if result.usage is None:
        raise ValueError(f"accepted attempt {attempt.attempt_id} omitted usage")
    if not matches_pinned_route(result, task.judge):
        raise ValueError(f"accepted attempt {attempt.attempt_id} violates its route pin")
    content = result.content
    if content is None or not content.strip():
        raise ValueError(f"accepted attempt {attempt.attempt_id} has no text completion")
    return content


def _reconstruct_request_sequence(
    task: VoteTask,
    grouped: _AttemptsByStage,
    *,
    prompt: VotePrompt,
    config: BaseRunConfig,
) -> _ReconstructedRequestSequence:
    initial_messages = prompt.initial(task)
    initial_request = _completion_request(
        task,
        stage="initial",
        messages=initial_messages,
        config=config,
    )
    initial = _successful(grouped, "initial")
    initial_raw = _accepted_content(task, initial) if initial is not None else None
    if not grouped["repair"]:
        return _ReconstructedRequestSequence(
            initial=initial_request,
            repair=None,
            initial_raw=initial_raw,
            repair_raw=None,
        )
    if initial_raw is None:
        raise ValueError(f"repair attempts for {task.vote_id} lack an accepted initial call")
    try:
        prompt.parse(initial_raw)
    except ValueError:
        pass
    else:
        raise ValueError(f"repair attempts for {task.vote_id} follow a valid initial response")

    repair_request = _completion_request(
        task,
        stage="repair",
        messages=prompt.repair(initial_messages, initial_raw),
        config=config,
    )
    repair = _successful(grouped, "repair")
    repair_raw = _accepted_content(task, repair) if repair is not None else None
    return _ReconstructedRequestSequence(
        initial=initial_request,
        repair=repair_request,
        initial_raw=initial_raw,
        repair_raw=repair_raw,
    )


def _validate_request_hashes(
    task: VoteTask,
    grouped: _AttemptsByStage,
    *,
    prompt: VotePrompt,
    config: BaseRunConfig,
    historical_request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...],
) -> tuple[str | None, str | None]:
    sequence = _reconstruct_request_sequence(
        task,
        grouped,
        prompt=prompt,
        config=config,
    )
    initial_hashes = _allowed_request_hashes(
        sequence.initial,
        task=task,
        stage="initial",
        historical_request_policy_ids=historical_request_policy_ids,
    )
    if any(attempt.request_hash not in initial_hashes for attempt in grouped["initial"]):
        raise ValueError(f"initial request hash differs for vote {task.vote_id}")
    if sequence.repair is None:
        return sequence.initial_raw, None
    repair_hashes = _allowed_request_hashes(
        sequence.repair,
        task=task,
        stage="repair",
        historical_request_policy_ids=historical_request_policy_ids,
    )
    if any(attempt.request_hash not in repair_hashes for attempt in grouped["repair"]):
        raise ValueError(f"repair request hash differs for vote {task.vote_id}")
    return sequence.initial_raw, sequence.repair_raw


def observed_request_policy_ids(
    task: VoteTask,
    attempts: tuple[PhysicalAttempt, ...],
    *,
    prompt: VotePrompt,
    config: BaseRunConfig,
) -> tuple[CompletionRequestPolicyId, ...]:
    """Identify every closed request policy represented by durable attempts.

    Each attempt must match exactly one registered policy for its reconstructed
    content. The result is deduplicated in registry order and is empty only
    when the supplied attempt sequence is empty.

    Raises:
        ValueError: Stage evidence is invalid, or a request hash has zero or
            multiple matching registered policies.

    """
    grouped = _group_attempts(task, attempts)
    sequence = _reconstruct_request_sequence(
        task,
        grouped,
        prompt=prompt,
        config=config,
    )
    requests: tuple[tuple[RequestStage, CompletionRequest], ...] = (
        (("initial", sequence.initial),)
        if sequence.repair is None
        else (("initial", sequence.initial), ("repair", sequence.repair))
    )
    observed: set[CompletionRequestPolicyId] = set()
    for stage, request in requests:
        for attempt in grouped[stage]:
            matches = tuple(
                policy_id
                for policy_id in COMPLETION_REQUEST_POLICY_IDS
                if attempt.request_hash
                == request_hash(
                    request,
                    vote_id=task.vote_id,
                    stage=stage,
                    policy_id=policy_id,
                )
            )
            if len(matches) != 1:
                raise ValueError(
                    f"attempt {attempt.attempt_id} matches {len(matches)} request policies"
                )
            observed.add(matches[0])
    return tuple(policy_id for policy_id in COMPLETION_REQUEST_POLICY_IDS if policy_id in observed)


def _validate_completed_vote(
    task: VoteTask,
    attempts: Sequence[PhysicalAttempt],
    vote: Vote,
    *,
    prompt: VotePrompt,
    initial_raw: str | None,
    repair_raw: str | None,
) -> None:
    if initial_raw is None:
        raise ValueError(f"completed vote {task.vote_id} lacks an accepted initial call")
    initial_parsed = None
    with suppress(ValueError):
        initial_parsed = prompt.parse(initial_raw)
    repaired = initial_parsed is None
    if repaired:
        if repair_raw is None:
            raise ValueError(f"completed vote {task.vote_id} lacks its repair result")
        try:
            parsed = prompt.parse(repair_raw)
        except ValueError:
            parsed = None
        final_raw = repair_raw
    else:
        if repair_raw is not None:
            raise ValueError(f"valid initial vote {task.vote_id} has a repair result")
        parsed = initial_parsed
        final_raw = initial_raw

    expected = _build_vote(
        task=task,
        attempts=attempts,
        initial_raw=initial_raw,
        final_raw=final_raw,
        parsed=parsed,
        repaired=repaired,
    )
    if vote != expected:
        expected_fields = expected.model_dump(mode="python", round_trip=True)
        observed_fields = vote.model_dump(mode="python", round_trip=True)
        differing = tuple(
            name for name in expected_fields if expected_fields[name] != observed_fields[name]
        )
        raise ValueError(f"vote {task.vote_id} differs from its attempts in fields {differing}")


def validate_attempt_sequence(
    task: VoteTask,
    attempts: tuple[PhysicalAttempt, ...],
    vote: Vote | None,
    *,
    prompt: VotePrompt,
    config: BaseRunConfig,
    historical_request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...] = (),
) -> None:
    """Prove request identity, stage protocol, route pins, and vote projection.

    The work is linear in the number of physical attempts for one logical
    vote and uses linear temporary space for its two request stages.

    Raises:
        ValueError: Durable evidence cannot have been produced by the planned
            request sequence.

    """
    grouped = _group_attempts(task, attempts)
    initial_raw, repair_raw = _validate_request_hashes(
        task,
        grouped,
        prompt=prompt,
        config=config,
        historical_request_policy_ids=historical_request_policy_ids,
    )
    if vote is not None:
        _validate_completed_vote(
            task,
            attempts,
            vote,
            prompt=prompt,
            initial_raw=initial_raw,
            repair_raw=repair_raw,
        )


def build_resume_index(
    plan: VotePlan,
    *,
    votes: tuple[Vote, ...],
    attempts: tuple[PhysicalAttempt, ...],
    prompt: VotePrompt,
    config: BaseRunConfig,
    historical_request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...] = (),
) -> ResumeIndex:
    """Validate a replayed plan and return only reusable durable evidence.

    Every attempted task is checked before its accepted result can enter a
    runner. Runtime is `O(P + A)`, where `P` is planned votes and `A` is
    physical attempts; the index retains `O(P + A)` references for resume.

    Raises:
        ValueError: Plan, request, route, stage, accounting, timing, or vote
            evidence differs from the deterministic replay.

    """

    def validate(
        task: VoteTask,
        task_attempts: tuple[PhysicalAttempt, ...],
        vote: Vote | None,
    ) -> None:
        validate_attempt_sequence(
            task,
            task_attempts,
            vote,
            prompt=prompt,
            config=config,
            historical_request_policy_ids=historical_request_policy_ids,
        )

    return index_resume(
        plan,
        votes=votes,
        attempts=attempts,
        validate_attempts=validate,
    )
