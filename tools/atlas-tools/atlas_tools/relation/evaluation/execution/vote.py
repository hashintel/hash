"""Execute durable physical requests and construct logical votes."""

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import monotonic
from typing import Protocol, assert_never

from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    AttemptFailure,
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    BaseRunConfig,
    FailedAttempt,
    InFlightRequest,
    PaidRequestIdentity,
    PhysicalAttempt,
    ProviderFailure,
    RejectedAttempt,
    RequestHash,
    RequestStage,
    TransientRetryConfig,
    TransportFailure,
    Verdict,
    Vote,
    VoteAccounting,
    VoteDecision,
    VoteEvidence,
    VoteId,
    VoteIdentity,
    VoteProvenance,
    VoteRequest,
    VoteTask,
    VoteTiming,
    attempt_id,
    failure_retry_after,
    failure_statuses,
    session_id,
)
from atlas_tools.relation.evaluation.execution.accounting import (
    CostLedger,
    CostLimitReachedError,
)
from atlas_tools.relation.evaluation.execution.control import (
    AdaptiveFamilyLimiter,
    ExecutionControl,
    ExecutionStoppedError,
    FamilyPermit,
)
from atlas_tools.relation.evaluation.execution.guard import CompletionPolicy
from atlas_tools.relation.evaluation.execution.scheduler import (
    ExecutionFailure,
    TaskCompleted,
    TaskDeferred,
    TaskFailed,
    TaskOutcome,
    TaskStopped,
    WorkItem,
    execute_ordered,
)
from atlas_tools.relation.evaluation.storage.api import ResumeIndex, RunJournal
from atlas_tools.relation.evaluation.transport.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    AsyncCompletionTransport,
    CompletionAccepted,
    CompletionFailed,
    CompletionMessage,
    CompletionRejected,
    CompletionRequest,
    request_hash,
)

_RETRYABLE_CLIENT_STATUSES = frozenset({408, 425, 429})
_RATE_LIMITED_STATUS = 429
_CLIENT_ERROR_MIN = 400
_CLIENT_ERROR_MAX = 500


def _ignore_committed_vote(_vote: Vote) -> None:
    return None


@dataclass(frozen=True, slots=True, kw_only=True)
class ParsedVote:
    """A parsed placement verdict and its judge-supplied reason."""

    verdict: Verdict
    reason: str


class VotePrompt(Protocol):
    """Build and parse prompts without coupling execution to one rubric."""

    def initial(self, task: VoteTask) -> tuple[CompletionMessage, ...]:
        """Build the initial messages for one logical vote."""
        ...

    def repair(
        self,
        messages: tuple[CompletionMessage, ...],
        malformed_completion: str,
    ) -> tuple[CompletionMessage, ...]:
        """Build the sole conversational repair request."""
        ...

    def parse(self, completion: str) -> ParsedVote:
        """Parse a completion or raise `ValueError` when it is malformed."""
        ...


@dataclass(frozen=True, slots=True, kw_only=True)
class _RetryDirective:
    delay: timedelta
    reason: str


class _VoteDeferredError(RuntimeError):
    __slots__ = ("failure",)

    def __init__(self, failure: ExecutionFailure) -> None:
        super().__init__(failure.message)
        self.failure = failure


class _VoteSystemicError(RuntimeError):
    __slots__ = ("failure",)

    def __init__(self, failure: ExecutionFailure) -> None:
        super().__init__(failure.message)
        self.failure = failure


def _is_systemic(failure: AttemptFailure) -> bool:
    return failure.scope == "session"


def _retry_directive(
    attempt: PhysicalAttempt,
    policy: TransientRetryConfig,
    *,
    now: datetime | None = None,
) -> _RetryDirective | None:
    failure = attempt.failure
    if failure is None or attempt.result is not None:
        return None
    statuses = failure_statuses(failure)
    if any(
        _CLIENT_ERROR_MIN <= status < _CLIENT_ERROR_MAX and status not in _RETRYABLE_CLIENT_STATUSES
        for status in statuses
    ):
        return None
    retryable = set(policy.status_codes)
    status_reason = (
        next(
            (
                f"{source} status {status}"
                for source, status in (
                    ("provider", failure.provider_status_code),
                    ("HTTP", failure.http_status_code),
                )
                if status in retryable
            ),
            None,
        )
        if isinstance(failure, ProviderFailure)
        else None
    )
    transport_error = policy.retry_transport_errors and isinstance(failure, TransportFailure)
    if status_reason is None and not transport_error:
        return None

    exponent = min(attempt.stage_attempt, 30)
    calculated = policy.initial_delay.total_seconds() * policy.backoff_multiplier**exponent
    bounded = timedelta(seconds=min(calculated, policy.maximum_delay.total_seconds()))
    delay = max(bounded, failure_retry_after(failure) or timedelta())
    current = now or datetime.now(UTC)
    remaining = max(attempt.response_at + delay - current, timedelta())

    return _RetryDirective(
        delay=remaining,
        reason=status_reason or "transport error",
    )


@dataclass(frozen=True, slots=True, kw_only=True)
class _Accounting:
    tokens_in: int
    tokens_out: int
    tokens_cached: int
    tokens_cache_write: int
    tokens_reasoning: int
    known_cost_usd: float
    cost_complete: bool


def _accounting(attempts: Sequence[PhysicalAttempt]) -> _Accounting:
    tokens_in = 0
    tokens_out = 0
    tokens_cached = 0
    tokens_cache_write = 0
    tokens_reasoning = 0
    known_cost = 0.0
    complete = True
    for attempt in attempts:
        result = attempt.result
        usage = result.usage if result is not None else None
        if usage is None:
            complete = False
            continue
        tokens_in += usage.prompt_tokens
        tokens_out += usage.completion_tokens
        tokens_cached += usage.cached_tokens
        tokens_cache_write += usage.cache_write_tokens
        tokens_reasoning += usage.reasoning_tokens
        if usage.cost_usd is None:
            complete = False
        else:
            known_cost += usage.cost_usd
    return _Accounting(
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        tokens_cached=tokens_cached,
        tokens_cache_write=tokens_cache_write,
        tokens_reasoning=tokens_reasoning,
        known_cost_usd=known_cost,
        cost_complete=complete,
    )


def _completion_request(
    task: VoteTask,
    *,
    stage: RequestStage,
    messages: tuple[CompletionMessage, ...],
    config: BaseRunConfig,
) -> CompletionRequest:
    return CompletionRequest(
        messages=messages,
        judge=task.judge,
        effort=task.effort,
        session_id=session_id(task),
        timeout=config.request_timeout,
        request_stage=stage,
    )


def _build_vote(
    *,
    task: VoteTask,
    attempts: Sequence[PhysicalAttempt],
    initial_raw: str,
    final_raw: str,
    parsed: ParsedVote | None,
    repaired: bool,
) -> Vote:
    results = tuple(
        attempt.result
        for attempt in attempts
        if attempt.failure is None and attempt.result is not None
    )
    expected_results = 2 if repaired else 1
    if len(results) != expected_results:
        raise ValueError(
            f"vote {task.vote_id} has {len(results)} accepted results, expected {expected_results}"
        )
    accounting = _accounting(attempts)
    return Vote(
        identity=VoteIdentity(
            vote_id=task.vote_id,
            relation_id=task.relation_id,
        ),
        provenance=VoteProvenance(
            card_hash=task.card_hash,
            rubric_version=task.rubric_version,
            prompt_pack_hash=task.prompt_pack_hash,
        ),
        request=VoteRequest(
            judge=task.judge.as_request_spec(),
            bundle_id=task.bundle_id,
            effort=task.effort,
            temperature=task.judge.temperature,
            seed=task.judge.seed,
            repeat_index=task.repeat_index,
        ),
        decision=VoteDecision(
            verdict=parsed.verdict if parsed is not None else "ABSTAIN",
            reason=parsed.reason if parsed is not None else "",
            raw_completion=final_raw,
            initial_raw_completion=initial_raw if repaired else None,
        ),
        evidence=VoteEvidence(
            accepted_attempt_ids=tuple(
                attempt.attempt_id
                for attempt in attempts
                if attempt.failure is None and attempt.result is not None
            ),
            model_returned=results[-1].model,
        ),
        accounting=VoteAccounting(
            tokens_in=accounting.tokens_in,
            tokens_out=accounting.tokens_out,
            tokens_cached=accounting.tokens_cached,
            tokens_cache_write=accounting.tokens_cache_write,
            tokens_reasoning=accounting.tokens_reasoning,
            known_cost_usd=accounting.known_cost_usd,
            cost_complete=accounting.cost_complete,
        ),
        timing=VoteTiming(
            request_at=min(attempt.request_at for attempt in attempts),
            response_at=max(attempt.response_at for attempt in attempts),
            latency=sum((attempt.latency for attempt in attempts), start=timedelta()),
        ),
    )


class LogicalVoteRunner:
    """Execute or resume logical votes over one shared async transport.

    Every physical request reserves cost, syncs an in-flight marker, performs
    one SDK-visible call, syncs its attempt, settles cost, and only then clears
    the marker. Transient retries are visible attempt rows. Malformed output
    receives exactly one repair stage; a malformed repair becomes an abstention.
    """

    __slots__ = (
        "_active",
        "_attempts",
        "_config",
        "_cost",
        "_families",
        "_guard",
        "_journal",
        "_prompt",
        "_session_stage_attempts",
        "_terminal_stages",
        "_transport",
    )

    def __init__(
        self,
        *,
        config: BaseRunConfig,
        prompt: VotePrompt,
        journal: RunJournal,
        transport: AsyncCompletionTransport,
        guard: CompletionPolicy | None = None,
        resume: ResumeIndex,
    ) -> None:
        self._config = config
        self._prompt = prompt
        self._journal = journal
        self._transport = transport
        self._guard = guard
        attempts = tuple(
            attempt
            for vote_attempts in resume.attempts_by_vote.values()
            for attempt in vote_attempts
        )
        self._cost = CostLedger.from_attempts(
            maximum_usd=config.max_cost_usd,
            attempts=attempts,
        )
        self._families = AdaptiveFamilyLimiter(
            maximum=min(config.concurrency.family_maximum, config.concurrency.maximum)
        )
        self._attempts: dict[VoteId, list[PhysicalAttempt]] = {}
        attempt_ids: set[AttemptId] = set()
        for attempt in attempts:
            if attempt.attempt_id in attempt_ids:
                raise ValueError(f"duplicate physical attempt {attempt.attempt_id}")
            attempt_ids.add(attempt.attempt_id)
            self._attempts.setdefault(attempt.vote_id, []).append(attempt)
        self._active: set[VoteId] = set()
        self._session_stage_attempts: dict[tuple[VoteId, RequestStage], int] = {}
        self._terminal_stages: set[tuple[VoteId, RequestStage]] = set()

    async def __call__(
        self,
        item: WorkItem[VoteTask],
        control: ExecutionControl,
    ) -> TaskOutcome[Vote]:
        task = item.task
        if task.vote_id in self._active:
            raise RuntimeError(f"vote {task.vote_id} was dispatched more than once")
        self._active.add(task.vote_id)
        try:
            vote = await self._execute_vote(task, control)
        except ExecutionStoppedError:
            return TaskStopped()
        except _VoteDeferredError as error:
            return TaskDeferred(failure=error.failure)
        except _VoteSystemicError as error:
            return TaskFailed(failure=error.failure)
        except CostLimitReachedError as error:
            return TaskFailed(
                failure=ExecutionFailure(category="infrastructure", message=str(error))
            )
        except OSError as error:
            return TaskFailed(
                failure=ExecutionFailure(
                    category="infrastructure",
                    message=str(error) or type(error).__qualname__,
                )
            )
        finally:
            self._active.remove(task.vote_id)
        return TaskCompleted(value=vote)

    async def _execute_vote(self, task: VoteTask, control: ExecutionControl) -> Vote:
        attempts = self._attempts.setdefault(task.vote_id, [])
        initial_messages = self._prompt.initial(task)
        initial = await self._execute_stage(
            task=task,
            stage="initial",
            messages=initial_messages,
            attempts=attempts,
            control=control,
        )
        initial_raw = self._accepted_content(initial)
        parsed = self._parse_or_none(initial_raw)
        final_raw = initial_raw
        repaired = parsed is None

        if repaired:
            repair = await self._execute_stage(
                task=task,
                stage="repair",
                messages=self._prompt.repair(initial_messages, initial_raw),
                attempts=attempts,
                control=control,
            )
            final_raw = self._accepted_content(repair)
            parsed = self._parse_or_none(final_raw)
        elif any(attempt.request_stage == "repair" for attempt in attempts):
            raise ValueError(f"vote {task.vote_id} has repair attempts after a valid initial")

        return _build_vote(
            task=task,
            attempts=attempts,
            initial_raw=initial_raw,
            final_raw=final_raw,
            parsed=parsed,
            repaired=repaired,
        )

    def _parse_or_none(self, content: str) -> ParsedVote | None:
        try:
            return self._prompt.parse(content)
        except ValueError:
            return None

    async def _execute_stage(
        self,
        *,
        task: VoteTask,
        stage: RequestStage,
        messages: tuple[CompletionMessage, ...],
        attempts: list[PhysicalAttempt],
        control: ExecutionControl,
    ) -> PhysicalAttempt:
        session_key = (task.vote_id, stage)
        if session_key in self._terminal_stages:
            raise _VoteDeferredError(
                ExecutionFailure(
                    category="vote",
                    message=f"{stage} has a terminal failure in this session",
                )
            )

        successful = tuple(
            attempt
            for attempt in attempts
            if attempt.request_stage == stage and attempt.failure is None
        )
        if len(successful) > 1:
            raise ValueError(f"vote {task.vote_id} has multiple successful {stage} attempts")
        if successful:
            return successful[0]

        prior = tuple(attempt for attempt in attempts if attempt.request_stage == stage)
        if prior:
            directive = _retry_directive(prior[-1], self._config.transient_retries)
            if directive is not None:
                await control.wait_for_retry(directive.delay)

        while True:
            session_attempts = self._session_stage_attempts.get(session_key, 0)
            if session_attempts >= self._config.transient_retries.maximum_attempts:
                raise _VoteDeferredError(
                    ExecutionFailure(
                        category="vote",
                        message=(f"{stage} exhausted {session_attempts} attempts in this session"),
                    )
                )
            attempt = await self._physical_request(
                task=task,
                stage=stage,
                messages=messages,
                previous=attempts,
                control=control,
            )
            attempts.append(attempt)
            session_attempts += 1
            self._session_stage_attempts[session_key] = session_attempts
            if attempt.failure is None:
                return attempt
            directive = self._retry_or_defer(
                attempt,
                session_key=session_key,
                session_attempts=session_attempts,
                stage=stage,
            )
            await control.wait_for_retry(directive.delay)

    def _retry_or_defer(
        self,
        attempt: PhysicalAttempt,
        *,
        session_key: tuple[VoteId, RequestStage],
        session_attempts: int,
        stage: RequestStage,
    ) -> _RetryDirective:
        failure = attempt.failure
        if failure is None:
            raise ValueError("retry policy requires a failed attempt")
        if _is_systemic(failure):
            raise _VoteSystemicError(ExecutionFailure(category="systemic", message=failure.message))

        directive = _retry_directive(attempt, self._config.transient_retries)
        if directive is None:
            self._terminal_stages.add(session_key)
            raise _VoteDeferredError(ExecutionFailure(category="vote", message=failure.message))
        if session_attempts >= self._config.transient_retries.maximum_attempts:
            raise _VoteDeferredError(
                ExecutionFailure(
                    category="vote",
                    message=(
                        f"{stage} exhausted {session_attempts} attempts after {directive.reason}"
                    ),
                )
            )
        return directive

    async def _physical_request(
        self,
        *,
        task: VoteTask,
        stage: RequestStage,
        messages: tuple[CompletionMessage, ...],
        previous: Sequence[PhysicalAttempt],
        control: ExecutionControl,
    ) -> PhysicalAttempt:
        request = _completion_request(
            task,
            stage=stage,
            messages=messages,
            config=self._config,
        )
        hash_value = request_hash(
            request,
            vote_id=task.vote_id,
            stage=stage,
            policy_id=ACTIVE_COMPLETION_REQUEST_POLICY_ID,
        )
        stage_attempt = sum(attempt.request_stage == stage for attempt in previous)
        physical_id = attempt_id(request_hash=hash_value, stage_attempt=stage_attempt)

        async with self._families.hold(task.judge.family_id) as permit:
            try:
                attempt = await self._authorized_request(
                    task=task,
                    stage=stage,
                    request=request,
                    request_hash_value=hash_value,
                    stage_attempt=stage_attempt,
                    physical_id=physical_id,
                    permit=permit,
                    control=control,
                )
            except ExecutionStoppedError:
                raise
            except BaseException as error:
                await control.stop(str(error) or type(error).__qualname__)
                raise
            else:
                return attempt

    async def _authorized_request(
        self,
        *,
        task: VoteTask,
        stage: RequestStage,
        request: CompletionRequest,
        request_hash_value: RequestHash,
        stage_attempt: int,
        physical_id: AttemptId,
        permit: FamilyPermit,
        control: ExecutionControl,
    ) -> PhysicalAttempt:
        requested_at = datetime.now(UTC)
        identity = PaidRequestIdentity(
            attempt_id=physical_id,
            vote_id=task.vote_id,
            request_hash=request_hash_value,
            stage=stage,
            stage_attempt=stage_attempt,
        )
        marker = InFlightRequest(
            identity=identity,
            created_at=requested_at,
        )

        async def begin() -> None:
            await self._cost.reserve()
            try:
                await self._journal.mark_inflight(marker)
            except BaseException:
                await self._cost.release_unspent()
                raise

        async with control.paid_request(begin):
            started = monotonic()
            outcome = await self._transport.complete(request)
            responded_at = datetime.now(UTC)
            provider_latency = timedelta(seconds=monotonic() - started)
            async with permit.ordered():
                if self._guard is not None:
                    outcome = self._guard.evaluate(request, outcome)
                match outcome:
                    case CompletionAccepted(result=result):
                        failure = None
                        durable_outcome = AcceptedAttempt(result=result)
                    case CompletionFailed(failure=failure):
                        result = None
                        durable_outcome = FailedAttempt(failure=failure)
                    case CompletionRejected(
                        failure=failure,
                        billed_result=result,
                    ):
                        durable_outcome = RejectedAttempt(result=result, failure=failure)
                    case unexpected:
                        assert_never(unexpected)
                attempt = PhysicalAttempt(
                    identity=identity,
                    route=AttemptRoute(
                        family_id=task.judge.family_id,
                        provider_slug=task.judge.provider_slug,
                        model_requested=task.judge.model,
                    ),
                    outcome=durable_outcome,
                    timing=AttemptTiming(
                        request_at=requested_at,
                        response_at=responded_at,
                        latency=provider_latency,
                    ),
                )
                durable = await self._cost.persist_and_settle(
                    attempt,
                    self._journal.append_attempt,
                )
                await self._journal.clear_inflight(durable)
                if failure is None:
                    permit.succeeded()
                else:
                    permit.failed(rate_limited=_RATE_LIMITED_STATUS in failure_statuses(failure))
                    if _is_systemic(failure):
                        await control.stop(failure.message)
                return attempt

    @staticmethod
    def _accepted_content(attempt: PhysicalAttempt) -> str:
        if attempt.failure is not None or attempt.result is None:
            raise ValueError(f"attempt {attempt.attempt_id} is not an accepted completion")
        content = attempt.result.content
        if content is None or not content.strip():
            raise ValueError(f"accepted attempt {attempt.attempt_id} has no content")
        return content


async def execute_votes(
    tasks: Iterable[VoteTask],
    *,
    runner: LogicalVoteRunner,
    config: BaseRunConfig,
    journal: RunJournal,
    start_index: int = 0,
    control: ExecutionControl | None = None,
    after_commit: Callable[[Vote], None] = _ignore_committed_vote,
) -> tuple[Vote, ...]:
    """Execute vote tasks and append only their deterministic completed prefix.

    `after_commit` observes votes only after their journal append is durable.
    It must be fast and non-blocking; application layers use it for progress
    accounting without making execution depend on a terminal or UI.
    """

    async def commit(_plan_index: int, vote: Vote) -> None:
        await journal.append_vote(vote)
        after_commit(vote)

    return await execute_ordered(
        (
            WorkItem(plan_index=plan_index, task=task)
            for plan_index, task in enumerate(tasks, start=start_index)
        ),
        runner=runner,
        concurrency=config.concurrency,
        start_index=start_index,
        commit=commit,
        control=control,
    )
