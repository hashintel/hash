"""Durable physical requests and logical vote construction for relation evaluation."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Literal, cast

import outcome
from openrouter.components import ChatMessages, ChatResult

from atlas_tools.common import Sha256Hex
from atlas_tools.relation.eval.accounting import CostGate, CostLimitReachedError
from atlas_tools.relation.eval.contract import (
    PreparedCards,
    RequestStage,
    TransientRetryConfig,
    VoteTask,
    session_id,
)
from atlas_tools.relation.eval.contract import (
    attempt_id as make_attempt_id,
)
from atlas_tools.relation.eval.control import ExecutionControl, ExecutionStoppedError
from atlas_tools.relation.eval.failures import (
    FailureCategory,
    completion_failure_category,
    failure_from_exception,
    is_systemic_failure,
    request_failure_category,
    retry_directive,
)
from atlas_tools.relation.eval.journal import (
    InFlightRequest,
    JournalPaths,
    append_attempt,
    mark_inflight,
)
from atlas_tools.relation.eval.prompt import (
    MalformedResponseError,
    Response,
    build_live_prompt,
    build_retry_prompt,
    parse_response,
)
from atlas_tools.relation.eval.schema import FramingId, PhysicalAttemptRow, ShellId, VoteRow
from atlas_tools.relation.eval.transport import (
    AcceptedCompletion,
    CompletionTransport,
    accepted_completion,
    aggregate_physical_usage,
    request_hash,
)


class PhysicalRequestFailedError(RuntimeError):
    """A transport/provider request failed after its outcome was durably recorded."""

    def __init__(self, message: str, attempt: PhysicalAttemptRow) -> None:
        super().__init__(message)
        self.attempt = attempt


class TransientRetryExhaustedError(PhysicalRequestFailedError):
    """A retryable request stage exhausted its configured visible attempts."""


class ProviderResponseRejectedError(RuntimeError):
    """A returned completion violated the required response or routing contract."""

    def __init__(self, message: str, attempt: PhysicalAttemptRow) -> None:
        super().__init__(message)
        self.attempt = attempt


class LogicalVoteFailedError(RuntimeError):
    """One logical vote failed; its durable attempts are carried for re-passes.

    ``systemic`` marks account-wide conditions (401/402) that doom every
    subsequent request; the executor stops the session for those and defers
    the vote for all other failures.
    """

    def __init__(
        self,
        message: str,
        *,
        attempts: tuple[PhysicalAttemptRow, ...],
        systemic: bool,
    ) -> None:
        super().__init__(message)
        self.attempts = attempts
        self.systemic = systemic


@dataclass(frozen=True)
class _BundleIds:
    shell: ShellId
    framing: FramingId
    framing_number: Literal[1, 2, 3]


@dataclass(frozen=True)
class _PhysicalOutcome:
    result: ChatResult | None
    error: Exception | None
    category: FailureCategory | None


def _normal_exception(captured: outcome.Error) -> Exception:
    error = captured.error
    if isinstance(error, Exception):
        return error
    raise error


def _call_transport(
    *,
    transport: CompletionTransport,
    messages: list[ChatMessages],
    task: VoteTask,
    timeout: timedelta,
) -> _PhysicalOutcome:
    called = outcome.capture(
        transport.complete,
        messages=messages,
        judge=task.judge,
        effort=task.effort,
        session_id=session_id(task),
        timeout=timeout,
    )
    if isinstance(called, outcome.Error):
        error = _normal_exception(called)
        return _PhysicalOutcome(None, error, request_failure_category(error))

    result = called.value
    validated = outcome.capture(accepted_completion, result, task.judge)
    if not isinstance(validated, outcome.Error):
        return _PhysicalOutcome(result, None, None)
    error = _normal_exception(validated)
    category = completion_failure_category(error) if isinstance(error, ValueError) else "response"
    return _PhysicalOutcome(result, error, category)


def _make_attempt(
    *,
    task: VoteTask,
    stage: RequestStage,
    stage_attempt: int,
    request_hash_value: Sha256Hex,
    attempt_id: Sha256Hex,
    physical: _PhysicalOutcome,
    ts_request: datetime,
    ts_response: datetime,
    latency: timedelta,
) -> PhysicalAttemptRow:
    failure = None
    if physical.error is not None:
        if physical.category is None:
            raise RuntimeError("physical failure is missing its persistence category")
        failure = failure_from_exception(physical.error, physical.category)
    return PhysicalAttemptRow(
        attempt_id=attempt_id,
        vote_id=task.vote_id,
        request_stage=stage,
        stage_attempt=stage_attempt,
        request_hash=request_hash_value,
        family_id=task.judge.family_id,
        provider_slug=task.judge.provider_slug,
        model_requested=task.judge.model,
        result=physical.result,
        failure=failure,
        ts_request=ts_request,
        ts_response=ts_response,
        latency=latency,
    )


def _persist_attempt(
    *,
    paths: JournalPaths,
    attempt: PhysicalAttemptRow,
    cost_gate: CostGate,
) -> None:
    cost_gate.settle_attempt(
        attempt,
        lambda: append_attempt(paths, attempt),
    )


def _authorize_and_mark(
    *,
    paths: JournalPaths,
    request: InFlightRequest,
    cost_gate: CostGate,
) -> None:
    cost_gate.authorize()
    try:
        mark_inflight(paths.inflight_dir, request)
    except BaseException:
        cost_gate.release_unspent()
        raise


def _execute_physical_request(
    *,
    paths: JournalPaths,
    task: VoteTask,
    stage: RequestStage,
    messages: list[ChatMessages],
    previous: Sequence[PhysicalAttemptRow],
    transport: CompletionTransport,
    timeout: timedelta,
    cost_gate: CostGate,
    execution_control: ExecutionControl,
) -> PhysicalAttemptRow:
    stage_attempt = sum(attempt.request_stage == stage for attempt in previous)
    request_hash_value = request_hash(messages, task, stage, timeout)
    attempt_id = make_attempt_id(request_hash_value, stage_attempt)
    ts_request = datetime.now(UTC)
    request = InFlightRequest(
        attempt_id=attempt_id,
        vote_id=task.vote_id,
        request_hash=request_hash_value,
        request_stage=stage,
        stage_attempt=stage_attempt,
        created_at=ts_request,
    )

    execution_control.begin_physical_request(
        lambda: _authorize_and_mark(paths=paths, request=request, cost_gate=cost_gate)
    )

    monotonic_start = monotonic()
    physical = _call_transport(
        transport=transport,
        messages=messages,
        task=task,
        timeout=timeout,
    )
    ts_response = datetime.now(UTC)
    built = outcome.capture(
        _make_attempt,
        task=task,
        stage=stage,
        stage_attempt=stage_attempt,
        request_hash_value=request_hash_value,
        attempt_id=attempt_id,
        physical=physical,
        ts_request=ts_request,
        ts_response=ts_response,
        latency=timedelta(seconds=monotonic() - monotonic_start),
    )
    if isinstance(built, outcome.Error):
        cost_gate.record_unknown_outcome()
        raise built.error
    attempt = built.value
    _persist_attempt(paths=paths, attempt=attempt, cost_gate=cost_gate)

    if physical.error is not None:
        if physical.result is not None:
            raise ProviderResponseRejectedError(
                f"provider response rejected; outcome preserved at {attempt_id}",
                attempt,
            ) from physical.error
        raise PhysicalRequestFailedError(
            f"physical {stage} request failed; outcome preserved at {attempt_id}",
            attempt,
        ) from physical.error
    return attempt


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


def _retry_delay_or_raise(
    attempt: PhysicalAttemptRow,
    *,
    stage: RequestStage,
    stage_attempt_count: int,
    policy: TransientRetryConfig,
    cause: BaseException | None = None,
) -> timedelta:
    directive = retry_directive(attempt, policy)
    if directive is None:
        error = PhysicalRequestFailedError(
            f"physical {stage} request failed with a terminal outcome; "
            f"preserved at {attempt.attempt_id}",
            attempt,
        )
    elif stage_attempt_count >= policy.maximum_attempts:
        error = TransientRetryExhaustedError(
            f"physical {stage} request failed after {stage_attempt_count} visible attempts "
            f"in this session; last {directive.reason} preserved at {attempt.attempt_id}",
            attempt,
        )
    else:
        return directive.delay
    if cause is not None:
        raise error from cause
    raise error


def _resume_gate_delay(
    last_prior: PhysicalAttemptRow,
    *,
    stage: RequestStage,
    policy: TransientRetryConfig,
) -> timedelta:
    """Admit a previously failed stage to a fresh visible budget.

    Prior failures depend on state that may have changed — provider health,
    rate limits, billing, or a model's stochastic output — so a new pass or
    session re-attempts them with a fresh budget rather than poisoning the
    vote. Any backoff still owed by the last durable attempt is honored
    before the first new request.
    """
    failure = last_prior.failure
    if failure is None:
        raise RuntimeError(
            f"stage {stage} resumed behind an unhandled successful attempt {last_prior.attempt_id}"
        )
    directive = retry_directive(last_prior, policy)
    return directive.delay if directive is not None else timedelta()


def _execute_request_stage(
    *,
    paths: JournalPaths,
    task: VoteTask,
    stage: RequestStage,
    messages: list[ChatMessages],
    completed_attempts: list[PhysicalAttemptRow],
    prior_attempt_count: int,
    transport: CompletionTransport,
    timeout: timedelta,
    retry_policy: TransientRetryConfig,
    cost_gate: CostGate,
    execution_control: ExecutionControl,
) -> PhysicalAttemptRow:
    successful = _successful_attempt(completed_attempts, stage)
    if successful is not None:
        return successful
    prior_stage_attempts = [
        attempt
        for attempt in completed_attempts[:prior_attempt_count]
        if attempt.request_stage == stage
    ]
    if prior_stage_attempts:
        delay = _resume_gate_delay(prior_stage_attempts[-1], stage=stage, policy=retry_policy)
        execution_control.wait_for_retry(delay)

    session_attempt_count = 0
    while True:
        try:
            attempt = _execute_physical_request(
                paths=paths,
                task=task,
                stage=stage,
                messages=messages,
                previous=completed_attempts,
                transport=transport,
                timeout=timeout,
                cost_gate=cost_gate,
                execution_control=execution_control,
            )
        except ProviderResponseRejectedError as error:
            completed_attempts.append(error.attempt)
            raise
        except PhysicalRequestFailedError as error:
            completed_attempts.append(error.attempt)
            session_attempt_count += 1
            delay = _retry_delay_or_raise(
                error.attempt,
                stage=stage,
                stage_attempt_count=session_attempt_count,
                policy=retry_policy,
                cause=error.__cause__,
            )
            execution_control.wait_for_retry(delay)
            continue
        completed_attempts.append(attempt)
        return attempt


def _accepted_attempt(
    attempt: PhysicalAttemptRow,
    task: VoteTask,
    stage: RequestStage,
) -> AcceptedCompletion:
    if attempt.result is None:
        raise ValueError(f"successful {stage} attempt for {task.vote_id} has no result")
    return accepted_completion(attempt.result, task.judge)


def _bundle_ids(task: VoteTask) -> _BundleIds:
    shell, framing = task.bundle_id.split("x", maxsplit=1)
    return _BundleIds(
        shell=cast("ShellId", shell),
        framing=cast("FramingId", framing),
        framing_number=cast("Literal[1, 2, 3]", int(framing[-1])),
    )


def _task_messages(task: VoteTask, prepared: PreparedCards) -> list[ChatMessages]:
    bundle = _bundle_ids(task)
    return build_live_prompt(
        prepared.prefixes[task.bundle_id],
        framing=bundle.framing_number,
        card_text=prepared.cards[task.relation_id].card_text,
    )


def _parse_or_none(content: str) -> Response | None:
    try:
        return parse_response(content)
    except MalformedResponseError:
        return None


def _build_vote(
    *,
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    initial_raw: str,
    final_raw: str,
    parsed: Response | None,
    repaired: bool,
) -> VoteRow:
    results = [
        attempt.result
        for attempt in attempts
        if attempt.failure is None and attempt.result is not None
    ]
    expected_results = 2 if repaired else 1
    if len(results) != expected_results:
        raise ValueError(
            f"vote {task.vote_id} has {len(results)} successful results, "
            f"expected {expected_results}"
        )
    accounting = aggregate_physical_usage(attempts)
    accepted = accepted_completion(results[-1], task.judge)
    bundle = _bundle_ids(task)
    return VoteRow(
        vote_id=task.vote_id,
        relation_id=task.relation_id,
        card_hash=task.card_hash,
        family_id=task.judge.family_id,
        provider=accepted.provider_name,
        model_returned=results[-1].model,
        shell_id=bundle.shell,
        framing_id=bundle.framing,
        bundle_id=task.bundle_id,
        rubric_version=task.rubric_version,
        prompt_pack_hash=task.pack_hash,
        verdict=parsed.verdict if parsed is not None else "ABSTAIN",
        reason=parsed.reason if parsed is not None else "",
        raw_completion=final_raw,
        parse_retries=1 if repaired else 0,
        abstained=parsed is None,
        initial_raw_completion=initial_raw if repaired else None,
        attempt_results=results,
        effort=task.effort,
        temperature=task.judge.temperature,
        seed=task.judge.seed,
        repeat_index=task.repeat_index,
        tokens_in=accounting.tokens_in,
        tokens_out=accounting.tokens_out,
        tokens_cached=accounting.tokens_cached,
        tokens_cache_write=accounting.tokens_cache_write,
        tokens_reasoning=accounting.tokens_reasoning,
        known_cost_usd=accounting.known_cost_usd,
        cost_complete=accounting.cost_complete,
        cost_usd=accounting.cost_usd,
        ts_request=min(attempt.ts_request for attempt in attempts),
        ts_response=max(attempt.ts_response for attempt in attempts),
        latency=sum((attempt.latency for attempt in attempts), start=timedelta()),
    )


def _systemic(error: Exception) -> bool:
    return isinstance(error, PhysicalRequestFailedError) and (
        error.attempt.failure is not None and is_systemic_failure(error.attempt.failure)
    )


def execute_logical_vote(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    *,
    paths: JournalPaths,
    prepared: PreparedCards,
    transport: CompletionTransport,
    timeout: timedelta,
    retry_policy: TransientRetryConfig,
    cost_gate: CostGate,
    execution_control: ExecutionControl,
) -> VoteRow:
    """Execute or resume one logical vote, durably recording every physical request.

    ``attempts`` are the durable rows from prior passes or sessions. The
    visible transient-retry budget applies to attempts made in this call;
    prior failures only gate admission and any remaining backoff. Vote-local
    failures raise :class:`LogicalVoteFailedError` carrying the accumulated
    durable attempts so the executor can defer and re-pass the vote.
    """
    completed_attempts = list(attempts)
    try:
        return _run_logical_vote(
            task,
            completed_attempts,
            paths=paths,
            prepared=prepared,
            transport=transport,
            timeout=timeout,
            retry_policy=retry_policy,
            cost_gate=cost_gate,
            execution_control=execution_control,
        )
    except ExecutionStoppedError, CostLimitReachedError, OSError:
        raise
    except Exception as error:
        raise LogicalVoteFailedError(
            str(error) or type(error).__qualname__,
            attempts=tuple(completed_attempts),
            systemic=_systemic(error),
        ) from error


def _run_logical_vote(
    task: VoteTask,
    completed_attempts: list[PhysicalAttemptRow],
    *,
    paths: JournalPaths,
    prepared: PreparedCards,
    transport: CompletionTransport,
    timeout: timedelta,
    retry_policy: TransientRetryConfig,
    cost_gate: CostGate,
    execution_control: ExecutionControl,
) -> VoteRow:
    messages = _task_messages(task, prepared)
    prior_attempt_count = len(completed_attempts)
    initial = _execute_request_stage(
        paths=paths,
        task=task,
        stage="initial",
        messages=messages,
        completed_attempts=completed_attempts,
        prior_attempt_count=prior_attempt_count,
        transport=transport,
        timeout=timeout,
        retry_policy=retry_policy,
        cost_gate=cost_gate,
        execution_control=execution_control,
    )
    initial_raw = _accepted_attempt(initial, task, "initial").content
    parsed = _parse_or_none(initial_raw)
    final_raw = initial_raw
    repaired = parsed is None

    if repaired:
        repair = _execute_request_stage(
            paths=paths,
            task=task,
            stage="repair",
            messages=build_retry_prompt(messages, initial_raw),
            completed_attempts=completed_attempts,
            prior_attempt_count=prior_attempt_count,
            transport=transport,
            timeout=timeout,
            retry_policy=retry_policy,
            cost_gate=cost_gate,
            execution_control=execution_control,
        )
        final_raw = _accepted_attempt(repair, task, "repair").content
        parsed = _parse_or_none(final_raw)

    return _build_vote(
        task=task,
        attempts=completed_attempts,
        initial_raw=initial_raw,
        final_raw=final_raw,
        parsed=parsed,
        repaired=repaired,
    )
